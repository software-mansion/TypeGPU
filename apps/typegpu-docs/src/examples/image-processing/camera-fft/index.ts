import { oklabGamutClip, oklabToLinearRgb } from '@typegpu/color';
import {
  createFft2d,
  createStockhamRadix2LineStrategy,
  createStockhamRadix4LineStrategy,
  type Fft2d,
} from '@typegpu/sort';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

/**
 * Pipeline: camera → luminance (optional separable Hann window) → `encodeForward` → radial low-pass on the
 * spectrum buffer → optional `encodeInverse` (spatial) or log-magnitude spectrum colored in **Oklab**
 * (lightness from magnitude, hue from complex phase via `a,b`).
 * Line FFT: **radix-4 (default)** (faster Stockham-style radix-4 + optional radix-2 tail) or **radix-2**
 * (pure Stockham radix-2). One compute pass chains fill, FFT, filter, inverse FFT, and spatial/mag; then a
 * render pass presents.
 */

const WORKGROUP = 256;

function nextPowerOf2(n: number): number {
  if (n <= 0) return 1;
  if ((n & (n - 1)) === 0) return n;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function log2Int(n: number): number {
  if (n <= 0 || (n & (n - 1)) !== 0) {
    throw new Error(`log2Int expects a positive power of two, got ${n}`);
  }
  return 31 - Math.clz32(n);
}

const MAX_WORKGROUPS_PER_DIMENSION = 65535;

function decomposeWorkgroups(total: number): [number, number, number] {
  if (total <= 0) {
    return [1, 1, 1];
  }
  const x = Math.min(total, MAX_WORKGROUPS_PER_DIMENSION);
  const remainingAfterX = Math.ceil(total / x);
  const y = Math.min(remainingAfterX, MAX_WORKGROUPS_PER_DIMENSION);
  const remainingAfterY = Math.ceil(remainingAfterX / y);
  const z = Math.min(remainingAfterY, MAX_WORKGROUPS_PER_DIMENSION);
  if (Math.ceil(total / (x * y * z)) > 1) {
    throw new Error(
      `Required workgroups (${total}) exceed device dispatch limits (${MAX_WORKGROUPS_PER_DIMENSION} per dimension)`,
    );
  }
  return [x, y, z];
}

/** Max longer side of the camera ROI before downscale; FFT pad is `nextPowerOf2(effW)×nextPowerOf2(effH)`. */
let fftMaxSide = 1024;

/** UI select values — must match `lineFft` control `options`. */
type LineFftMode = 'radix-4 (default)' | 'radix-2';

let lineFftMode: LineFftMode = 'radix-4 (default)';
/** Tracks which line mode the current `fft` was built with (invalidate on change). */
let fftLineFftMode: LineFftMode | undefined;

/** Decode size for layout + downscale math (metadata can disagree with what `<video>` exposes). */
function decodedFrameSize(
  metadata: VideoFrameCallbackMetadata,
  videoEl: HTMLVideoElement,
): { width: number; height: number } {
  const w = Math.max(1, videoEl.videoWidth || metadata.width);
  const h = Math.max(1, videoEl.videoHeight || metadata.height);
  return { width: w, height: h };
}

const fillParamsType = d.struct({
  videoW: d.u32,
  videoH: d.u32,
  padW: d.u32,
  padH: d.u32,
  /** `log2(padW)` — pad width is a power of two. */
  padWLog2: d.u32,
  /** `padW - 1` for `tid & padWMask` column index. */
  padWMask: d.u32,
  /** 1: multiply luminance by separable Hann window (tames FFT boundary cross); 0: raw samples. */
  edgeWindow: d.u32,
});

const fillLayout = tgpu.bindGroupLayout({
  video: { texture: d.texture2d() },
  params: { uniform: fillParamsType },
  out: { storage: d.arrayOf(d.vec2f), access: 'mutable' },
});

const fillKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const wg = d.u32(WORKGROUP);
  const spanX = input.numWorkgroups.x * wg;
  const spanY = input.numWorkgroups.y * spanX;
  const tid = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  const padW = fillLayout.$.params.padW;
  const padH = fillLayout.$.params.padH;
  const total = padW * padH;
  if (tid >= total) {
    return;
  }

  const padWLog2 = fillLayout.$.params.padWLog2;
  const padWMask = fillLayout.$.params.padWMask;
  const x = tid & padWMask;
  const y = tid >> padWLog2;
  const videoW = fillLayout.$.params.videoW;
  const videoH = fillLayout.$.params.videoH;

  if (x < videoW && y < videoH) {
    const px = std.textureLoad(fillLayout.$.video, d.vec2i(d.i32(x), d.i32(y)), 0);
    let l = 0.2126 * px.x + 0.7152 * px.y + 0.0722 * px.z;
    if (fillLayout.$.params.edgeWindow != d.u32(0)) {
      const denomW = d.f32(std.max(videoW - d.u32(1), d.u32(1)));
      const denomH = d.f32(std.max(videoH - d.u32(1), d.u32(1)));
      const tx = d.f32(x) / denomW;
      const ty = d.f32(y) / denomH;
      const twoPi = 6.283185307179586;
      const hx = 0.5 * (1.0 - std.cos(twoPi * tx));
      const hy = 0.5 * (1.0 - std.cos(twoPi * ty));
      l = l * (hx * hy);
    }
    fillLayout.$.out[tid] = d.vec2f(l, 0.0);
  } else {
    fillLayout.$.out[tid] = d.vec2f(0.0, 0.0);
  }
});

const filterParamsType = d.struct({
  padW: d.u32,
  padH: d.u32,
  padWLog2: d.u32,
  padWMask: d.u32,
  padHLog2: d.u32,
  padHMask: d.u32,
  /** 1 = pass all bins; 0 = DC only. Scales max toroidal radius √(hw²+hh²), hw = padW/2, hh = padH/2. */
  cutoffRadius: d.f32,
  /** 1 when `Fft2d.skipFinalTranspose`: spectrum is `W×H` row-major with stride `padH` (`r*padH+c`), not `y*padW+x`. */
  swapSpectrumAxes: d.u32,
});

const filterLayout = tgpu.bindGroupLayout({
  spectrum: { storage: d.arrayOf(d.vec2f), access: 'mutable' },
  params: { uniform: filterParamsType },
});

const filterKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const wg = d.u32(WORKGROUP);
  const spanX = input.numWorkgroups.x * wg;
  const spanY = input.numWorkgroups.y * spanX;
  const tid = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  const padW = filterLayout.$.params.padW;
  const padH = filterLayout.$.params.padH;
  if (tid >= padW * padH) {
    return;
  }

  const padWLog2 = filterLayout.$.params.padWLog2;
  const padWMask = filterLayout.$.params.padWMask;
  const padHLog2 = filterLayout.$.params.padHLog2;
  const padHMask = filterLayout.$.params.padHMask;
  const swap = filterLayout.$.params.swapSpectrumAxes !== d.u32(0);
  /** Natural freq (kx,ky): row-major `ky*padW+kx` when not skip; skip-final layout uses `kx*padH+ky`. */
  const kx = std.select(tid & padWMask, tid >> padHLog2, swap);
  const ky = std.select(tid >> padWLog2, tid & padHMask, swap);
  const x = kx;
  const y = ky;
  const nx = padW - x;
  const ny = padH - y;
  const rxf = d.f32(std.min(x, nx));
  const ryf = d.f32(std.min(y, ny));
  const r2 = rxf * rxf + ryf * ryf;
  const halfW = padW >> 1;
  const halfH = padH >> 1;
  const hw = d.f32(halfW);
  const hh = d.f32(halfH);
  const rMax = std.sqrt(hw * hw + hh * hh);
  const cutoff = filterLayout.$.params.cutoffRadius * rMax;
  const r = std.sqrt(r2);
  const mask = std.select(d.f32(0), d.f32(1), r <= cutoff);
  const c = filterLayout.$.spectrum[tid];
  filterLayout.$.spectrum[tid] = d.vec2f(c.x * mask, c.y * mask);
});

const magParamsType = d.struct({
  padW: d.u32,
  padH: d.u32,
  gain: d.f32,
  padWLog2: d.u32,
  padWMask: d.u32,
  swapSpectrumAxes: d.u32,
});

const magLayout = tgpu.bindGroupLayout({
  spectrum: { storage: d.arrayOf(d.vec2f), access: 'readonly' },
  params: { uniform: magParamsType },
  outTex: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

const magKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  'use gpu';
  const wg = d.u32(WORKGROUP);
  const spanX = input.numWorkgroups.x * wg;
  const spanY = input.numWorkgroups.y * spanX;
  const tid = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  const padW = magLayout.$.params.padW;
  const padH = magLayout.$.params.padH;
  if (tid >= padW * padH) {
    return;
  }

  const padWLog2 = magLayout.$.params.padWLog2;
  const padWMask = magLayout.$.params.padWMask;
  const xLin = tid & padWMask;
  const yLin = tid >> padWLog2;
  const halfW = padW >> 1;
  const halfH = padH >> 1;
  const srcX = (xLin + halfW) % padW;
  const srcY = (yLin + halfH) % padH;
  /** fftshift read: natural row-major `srcY*padW+srcX` vs skip-layout stride-`padH` `srcX*padH+srcY`. */
  const srcTid = std.select(
    srcX + (srcY << padWLog2),
    srcX * padH + srcY,
    magLayout.$.params.swapSpectrumAxes !== d.u32(0),
  );
  const cShift = magLayout.$.spectrum[srcTid];
  const len = std.sqrt(cShift.x * cShift.x + cShift.y * cShift.y);
  const logv = std.log(1.0 + len) * magLayout.$.params.gain;
  const cv = std.clamp(logv, 0.0, 1.0);
  /** `cv` from log-magnitude; L ∈ [0.04, 1]; chroma → 0 at max `cv` so peaks go neutral white. */
  const L = 0.04 + cv * (1.0 - 0.04);
  const chroma = cv * (1.0 - cv) * 0.32;
  /** Oklab a,b = chroma × unit phase — same as chroma·(cos θ, sin θ) with θ = atan2(im, re), without trig. */
  const invLen = 1.0 / std.max(len, 1e-20);
  const lab = d.vec3f(L, chroma * invLen * cShift.x, chroma * invLen * cShift.y);
  const rgb = oklabToLinearRgb(oklabGamutClip.adaptiveL05(lab));
  std.textureStore(magLayout.$.outTex, d.vec2u(xLin, yLin), d.vec4f(rgb, 1));
});

const spatialParamsType = d.struct({
  padW: d.u32,
  padH: d.u32,
  padWLog2: d.u32,
  padWMask: d.u32,
  /** `1 / (padW * padH)` — unnormalized inverse scaling. */
  invSize: d.f32,
});

const spatialLayout = tgpu.bindGroupLayout({
  spectrum: { storage: d.arrayOf(d.vec2f), access: 'readonly' },
  params: { uniform: spatialParamsType },
  outTex: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

const spatialKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const wg = d.u32(WORKGROUP);
  const spanX = input.numWorkgroups.x * wg;
  const spanY = input.numWorkgroups.y * spanX;
  const tid = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  const padW = spatialLayout.$.params.padW;
  const padH = spatialLayout.$.params.padH;
  if (tid >= padW * padH) {
    return;
  }

  const c = spatialLayout.$.spectrum[tid];
  const inv = spatialLayout.$.params.invSize;
  const g = std.clamp(c.x * inv, 0.0, 1.0);
  const padWLog2 = spatialLayout.$.params.padWLog2;
  const padWMask = spatialLayout.$.params.padWMask;
  const x = tid & padWMask;
  const y = tid >> padWLog2;
  std.textureStore(spatialLayout.$.outTex, d.vec2u(x, y), d.vec4f(g, g, g, 1));
});

/**
 * Drawable: texture is `padW×padH`. Spectrum: letterbox the full pad. Spatial (inverse on): letterbox
 * only the top-left `effW×effH` image so it scales up to the canvas like the camera frame aspect.
 */
const displayFbType = d.struct({
  fbW: d.f32,
  fbH: d.f32,
  padW: d.f32,
  padH: d.f32,
  effW: d.f32,
  effH: d.f32,
  /** 0 = spectrum (fit full pad); 1 = spatial (fit eff crop only). */
  viewMode: d.u32,
});

const displayLayout = tgpu.bindGroupLayout({
  fb: { uniform: displayFbType },
  spectrumTex: { texture: d.texture2d(d.f32) },
  samp: { sampler: 'filtering' },
});

/**
 * Interpolated `uv` from `fullScreenTriangle` maps the clip triangle to a **triangle** in st-space,
 * not the full unit square — most of the screen samples a shrunk region (tiny picture). Use
 * fragment `position` / drawable size instead for a linear [0,1]² stretch.
 */
const spectrumFrag = tgpu.fragmentFn({
  in: { position: d.builtin.position },
  out: d.vec4f,
})((input) => {
  const fbW = displayLayout.$.fb.fbW;
  const fbH = displayLayout.$.fb.fbH;
  const padW = displayLayout.$.fb.padW;
  const padH = displayLayout.$.fb.padH;
  const effW = displayLayout.$.fb.effW;
  const effH = displayLayout.$.fb.effH;
  const viewMode = displayLayout.$.fb.viewMode;
  const cw = std.select(padW, effW, viewMode !== 0);
  const ch = std.select(padH, effH, viewMode !== 0);
  /** Normalized coords in [0,1]² so letterboxing stays centered for pixel-center `position`. */
  const qx = input.position.x / fbW;
  const qy = input.position.y / fbH;
  const s = std.min(fbW / cw, fbH / ch);
  const bw = (cw * s) / fbW;
  const bh = (ch * s) / fbH;
  const u0 = (1.0 - bw) * 0.5;
  const v0 = (1.0 - bh) * 0.5;
  const inContent = qx >= u0 && qx <= u0 + bw && qy >= v0 && qy <= v0 + bh;
  if (!inContent) {
    return d.vec4f(0.02, 0.02, 0.05, 1);
  }
  const u = (qx - u0) / bw;
  const v = (qy - v0) / bh;
  const st = d.vec2f(
    std.select(u, u * (effW / padW), viewMode !== 0),
    std.select(v, v * (effH / padH), viewMode !== 0),
  );
  const col = std.textureSampleLevel(displayLayout.$.spectrumTex, displayLayout.$.samp, st, 0);
  return d.vec4f(col.rgb, 1);
});

const videoBlitTargetDimsType = d.struct({
  w: d.f32,
  h: d.f32,
});

const videoBlitLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
  /** Render-target size (pixels); `fullScreenTriangle` uv is not linear in pixel space for offscreen passes. */
  targetPx: { uniform: videoBlitTargetDimsType },
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const video = document.querySelector('video') as HTMLVideoElement;
const spinner = document.querySelector('.spinner-background') as HTMLDivElement;

if (navigator.mediaDevices.getUserMedia) {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60 },
    },
  });
} else {
  throw new Error('getUserMedia not supported');
}

const root = await tgpu.init();
const device = root.device;

/** Omit final spectrum transpose (matches `createFft2d`); saves one global transpose after column FFT. */
const SKIP_FINAL_FFT_TRANSPOSE = true;

const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const videoBlitTargetPx = root.createBuffer(videoBlitTargetDimsType).$usage('uniform');

const videoBlitFrag = tgpu.fragmentFn({
  in: { position: d.builtin.position },
  out: d.vec4f,
})((input) => {
  const w = d.f32(videoBlitLayout.$.targetPx.w);
  const rtH = d.f32(videoBlitLayout.$.targetPx.h);
  const st = d.vec2f(input.position.x / w, input.position.y / rtH);
  return std.textureSampleBaseClampToEdge(videoBlitLayout.$.inputTexture, sampler.$, st);
});

const videoBlitPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: videoBlitFrag,
  targets: { format: 'rgba8unorm' },
});

function createPaddedDisplayTexture(w: number, h: number) {
  return root['~unstable']
    .createTexture({ size: [w, h], format: 'rgba16float' })
    .$usage('storage', 'sampled');
}

function createCameraInputTexture(w: number, h: number) {
  return root['~unstable']
    .createTexture({ size: [w, h], format: 'rgba8unorm' })
    .$usage('sampled', 'render');
}

function displayStorageViewOf(t: ReturnType<typeof createPaddedDisplayTexture>) {
  return t.createView(d.textureStorage2d('rgba16float', 'write-only'));
}

function displaySampleViewOf(t: ReturnType<typeof createPaddedDisplayTexture>) {
  return t.createView(d.texture2d(d.f32));
}

let videoTexture: ReturnType<typeof createCameraInputTexture> | undefined;
/** Color attachment for `videoBlitPipeline` (same underlying texture the fill kernel samples). */
let videoRenderTargetView: GPUTextureView | undefined;
let videoW = 0;
let videoH = 0;

let padW = 0;
let padH = 0;
let fft: Fft2d | undefined;
let displayTexture: ReturnType<typeof createPaddedDisplayTexture> | undefined;
let displaySampleView: ReturnType<typeof displaySampleViewOf> | undefined;
let displayStorageView: ReturnType<typeof displayStorageViewOf> | undefined;

const fillParams = root.createBuffer(fillParamsType).$usage('uniform');
const filterParams = root.createBuffer(filterParamsType).$usage('uniform');
const magParams = root.createBuffer(magParamsType).$usage('uniform');
const spatialParams = root.createBuffer(spatialParamsType).$usage('uniform');
const displayFb = root.createBuffer(displayFbType).$usage('uniform');
const fillPipeline = root.createComputePipeline({ compute: fillKernel });
const filterPipeline = root.createComputePipeline({ compute: filterKernel });
const magPipeline = root.createComputePipeline({ compute: magKernel });
const spatialPipeline = root.createComputePipeline({ compute: spatialKernel });
const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: spectrumFrag,
  targets: { format: presentationFormat },
});

/** When true: after forward FFT, run inverse and show grayscale spatial reconstruction. When false: show log-magnitude spectrum (forward only). */
let applyInverseFft = false;
let gainValue = 0.2;
/** Normalized low-pass cutoff vs max toroidal radius (1 = no filtering). */
let cutoffRadiusNorm = 1;
/** Separable Hann window on camera ROI before FFT (reduces periodic-boundary cross in spectrum). */
let applyEdgeWindow = false;
let lastFillUniformKey = '';
let lastMagUniformKey = '';
let lastSpatialUniformKey = '';
let lastFilterUniformKey = '';
let lastDisplayFbKey = '';
let lastVideoBlitKey = '';

function effectiveFrameSize(frameW: number, frameH: number): { effW: number; effH: number } {
  let effW: number;
  let effH: number;
  if (frameW <= fftMaxSide && frameH <= fftMaxSide) {
    effW = frameW;
    effH = frameH;
  } else {
    const scale = fftMaxSide / Math.max(frameW, frameH);
    effW = Math.max(1, Math.floor(frameW * scale));
    effH = Math.max(1, Math.floor(frameH * scale));
  }
  return { effW, effH };
}

let fillBindGroup: ReturnType<typeof root.createBindGroup> | undefined;
/** One bind group per ping-pong buffer; use `fft.outputIndex()` after each transform to pick the right one. */
let magBindSlots:
  | [ReturnType<typeof root.createBindGroup>, ReturnType<typeof root.createBindGroup>]
  | undefined;
let filterBindSlots:
  | [ReturnType<typeof root.createBindGroup>, ReturnType<typeof root.createBindGroup>]
  | undefined;
let spatialBindSlots:
  | [ReturnType<typeof root.createBindGroup>, ReturnType<typeof root.createBindGroup>]
  | undefined;
let renderBindGroup: ReturnType<typeof root.createBindGroup> | undefined;

function invalidateBindGroups(all: boolean) {
  fillBindGroup = undefined;
  if (all) {
    magBindSlots = undefined;
    filterBindSlots = undefined;
    spatialBindSlots = undefined;
    renderBindGroup = undefined;
  }
}

function destroyVideoTexture() {
  videoTexture?.destroy();
  videoTexture = undefined;
  videoRenderTargetView = undefined;
  fillBindGroup = undefined;
}

function destroyFftBlock() {
  fft?.destroy();
  fft = undefined;
  fftLineFftMode = undefined;
  displayTexture?.destroy();
  displayTexture = undefined;
  displaySampleView = undefined;
  displayStorageView = undefined;
  invalidateBindGroups(true);
}

function ensureResources(frameW: number, frameH: number) {
  const { effW, effH } = effectiveFrameSize(frameW, frameH);
  const nextPadW = nextPowerOf2(effW);
  const nextPadH = nextPowerOf2(effH);

  const needVideoTex = !videoTexture || videoW !== effW || videoH !== effH;
  const needFft = !fft || padW !== nextPadW || padH !== nextPadH || fftLineFftMode !== lineFftMode;

  if (needFft) {
    destroyFftBlock();
    padW = nextPadW;
    padH = nextPadH;
    const lineFftStrategyFactory =
      lineFftMode === 'radix-2'
        ? createStockhamRadix2LineStrategy
        : createStockhamRadix4LineStrategy;
    fft = createFft2d(root, {
      width: padW,
      height: padH,
      skipFinalTranspose: SKIP_FINAL_FFT_TRANSPOSE,
      lineFftStrategyFactory,
    });
    fftLineFftMode = lineFftMode;
    lastFillUniformKey = '';
    lastMagUniformKey = '';
    lastSpatialUniformKey = '';
    lastFilterUniformKey = '';
    lastDisplayFbKey = '';
    lastVideoBlitKey = '';

    displayTexture = createPaddedDisplayTexture(padW, padH);

    displayStorageView = displayStorageViewOf(displayTexture);
    displaySampleView = displaySampleViewOf(displayTexture);
  }

  if (needVideoTex) {
    destroyVideoTexture();
    videoW = effW;
    videoH = effH;
    videoTexture = createCameraInputTexture(effW, effH);
    videoRenderTargetView = root.unwrap(videoTexture).createView();
  }

  if (fft && videoTexture && displayStorageView && displaySampleView) {
    if (!fillBindGroup) {
      fillBindGroup = root.createBindGroup(fillLayout, {
        video: videoTexture.createView(d.texture2d()),
        params: fillParams,
        out: fft.input,
      });
    }
    if (!magBindSlots) {
      magBindSlots = [
        root.createBindGroup(magLayout, {
          spectrum: fft.buffers[0],
          params: magParams,
          outTex: displayStorageView,
        }),
        root.createBindGroup(magLayout, {
          spectrum: fft.buffers[1],
          params: magParams,
          outTex: displayStorageView,
        }),
      ];
    }
    if (!filterBindSlots) {
      filterBindSlots = [
        root.createBindGroup(filterLayout, {
          spectrum: fft.buffers[0],
          params: filterParams,
        }),
        root.createBindGroup(filterLayout, {
          spectrum: fft.buffers[1],
          params: filterParams,
        }),
      ];
    }
    if (!spatialBindSlots) {
      spatialBindSlots = [
        root.createBindGroup(spatialLayout, {
          spectrum: fft.buffers[0],
          params: spatialParams,
          outTex: displayStorageView,
        }),
        root.createBindGroup(spatialLayout, {
          spectrum: fft.buffers[1],
          params: spatialParams,
          outTex: displayStorageView,
        }),
      ];
    }
    if (!renderBindGroup) {
      renderBindGroup = root.createBindGroup(displayLayout, {
        fb: displayFb,
        spectrumTex: displaySampleView,
        samp: sampler,
      });
    }
  }
}

function onVideoChange(size: { width: number; height: number }) {
  const aspectRatio = size.width / size.height;
  video.style.height = `${video.clientWidth / aspectRatio}px`;
}

let videoFrameCallbackId: number | undefined;
let lastFrameSize: { width: number; height: number } | undefined;

function processVideoFrame(_: number, metadata: VideoFrameCallbackMetadata) {
  if (video.readyState < 2) {
    videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
    return;
  }

  const { width: frameWidth, height: frameHeight } = decodedFrameSize(metadata, video);

  if (
    !lastFrameSize ||
    lastFrameSize.width !== frameWidth ||
    lastFrameSize.height !== frameHeight
  ) {
    lastFrameSize = { width: frameWidth, height: frameHeight };
    onVideoChange(lastFrameSize);
  }

  ensureResources(frameWidth, frameHeight);
  if (
    !fft ||
    !videoTexture ||
    !videoRenderTargetView ||
    !displayStorageView ||
    !displaySampleView ||
    !fillBindGroup ||
    !filterBindSlots ||
    !magBindSlots ||
    !spatialBindSlots ||
    !renderBindGroup
  ) {
    videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
    return;
  }

  const activeFft = fft;

  const { effW, effH } = effectiveFrameSize(frameWidth, frameHeight);

  const videoBlitKey = `${effW}x${effH}`;
  if (videoBlitKey !== lastVideoBlitKey) {
    lastVideoBlitKey = videoBlitKey;
    videoBlitTargetPx.write({ w: effW, h: effH });
  }
  const videoBlitBindGroup = root.createBindGroup(videoBlitLayout, {
    inputTexture: device.importExternalTexture({ source: video }),
    targetPx: videoBlitTargetPx,
  });
  videoBlitPipeline
    .with(videoBlitBindGroup)
    .withColorAttachment({
      view: videoRenderTargetView,
      clearValue: [0, 0, 0, 1],
    })
    .draw(3);

  const padWLog2 = log2Int(padW);
  const fillUniformKey = `${effW}x${effH}x${padW}x${padH}x${applyEdgeWindow}`;
  if (fillUniformKey !== lastFillUniformKey) {
    lastFillUniformKey = fillUniformKey;
    fillParams.write({
      videoW: effW,
      videoH: effH,
      padW,
      padH,
      padWLog2,
      padWMask: padW - 1,
      edgeWindow: applyEdgeWindow ? 1 : 0,
    });
  }

  const magUniformKey = `${padW}x${padH}x${gainValue}x${activeFft.skipFinalTranspose}`;
  if (magUniformKey !== lastMagUniformKey) {
    lastMagUniformKey = magUniformKey;
    magParams.write({
      padW,
      padH,
      gain: gainValue,
      padWLog2,
      padWMask: padW - 1,
      swapSpectrumAxes: activeFft.skipFinalTranspose ? 1 : 0,
    });
  }

  const spatialUniformKey = `${padW}x${padH}x${gainValue}`;
  if (spatialUniformKey !== lastSpatialUniformKey) {
    lastSpatialUniformKey = spatialUniformKey;
    spatialParams.write({
      padW,
      padH,
      padWLog2,
      padWMask: padW - 1,
      invSize: 1 / (padW * padH),
    });
  }

  const filterUniformKey = `${padW}x${padH}x${cutoffRadiusNorm}x${activeFft.skipFinalTranspose}`;
  if (filterUniformKey !== lastFilterUniformKey) {
    lastFilterUniformKey = filterUniformKey;
    filterParams.write({
      padW,
      padH,
      padWLog2,
      padWMask: padW - 1,
      padHLog2: log2Int(padH),
      padHMask: padH - 1,
      cutoffRadius: cutoffRadiusNorm,
      swapSpectrumAxes: activeFft.skipFinalTranspose ? 1 : 0,
    });
  }

  const totalFill = padW * padH;
  const [gx, gy, gz] = decomposeWorkgroups(Math.ceil(totalFill / WORKGROUP));

  const gpuCanvas = context.canvas;
  const fbW = Math.max(1, gpuCanvas.width);
  const fbH = Math.max(1, gpuCanvas.height);
  const displayFbKey = `${fbW}x${fbH}x${padW}x${padH}x${effW}x${effH}x${applyInverseFft}`;
  if (displayFbKey !== lastDisplayFbKey) {
    lastDisplayFbKey = displayFbKey;
    displayFb.write({
      fbW,
      fbH,
      padW,
      padH,
      effW,
      effH,
      viewMode: applyInverseFft ? 1 : 0,
    });
  }

  const enc = device.createCommandEncoder({ label: 'camera-fft frame' });
  {
    const computePass = enc.beginComputePass({ label: 'camera-fft fft-pipeline' });
    fillPipeline.with(computePass).with(fillBindGroup).dispatchWorkgroups(gx, gy, gz);
    activeFft.encodeForward(computePass);
    const spectrumIdx = activeFft.outputIndex();
    filterPipeline
      .with(computePass)
      .with(filterBindSlots[spectrumIdx])
      .dispatchWorkgroups(gx, gy, gz);
    if (applyInverseFft) {
      activeFft.encodeInverse(computePass);
      const spatialIdx = activeFft.outputIndex();
      spatialPipeline
        .with(computePass)
        .with(spatialBindSlots[spatialIdx])
        .dispatchWorkgroups(gx, gy, gz);
    } else {
      magPipeline.with(computePass).with(magBindSlots[spectrumIdx]).dispatchWorkgroups(gx, gy, gz);
    }
    computePass.end();
  }
  renderPipeline
    .with(enc)
    .withColorAttachment({
      view: context,
      clearValue: [0.02, 0.02, 0.05, 1],
    })
    .with(renderBindGroup)
    .draw(3);
  device.queue.submit([enc.finish()]);

  spinner.style.display = 'none';

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}

videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

export const controls = defineControls({
  inverseFft: {
    initial: false,
    onToggleChange: (value) => {
      applyInverseFft = value;
      lastDisplayFbKey = '';
    },
  },
  edgeWindow: {
    initial: false,
    onToggleChange: (value) => {
      applyEdgeWindow = value;
      lastFillUniformKey = '';
    },
  },
  fftMaxSide: {
    initial: '512',
    options: ['512', '1024', '2048'],
    onSelectChange: (value) => {
      fftMaxSide = Number(value);
    },
  },
  lineFft: {
    initial: lineFftMode,
    options: ['radix-4 (default)', 'radix-2'],
    onSelectChange: (value) => {
      lineFftMode = value as LineFftMode;
    },
  },
  gain: {
    initial: gainValue,
    min: 0.01,
    max: 0.45,
    step: 0.005,
    onSliderChange: (value) => {
      gainValue = value;
      lastMagUniformKey = '';
      lastSpatialUniformKey = '';
    },
  },
  cutoffRadius: {
    initial: 1,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => {
      cutoffRadiusNorm = value;
      lastFilterUniformKey = '';
    },
  },
});

export function onCleanup() {
  if (videoFrameCallbackId !== undefined) {
    video.cancelVideoFrameCallback(videoFrameCallbackId);
  }
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }
  fillBindGroup = undefined;
  magBindSlots = undefined;
  filterBindSlots = undefined;
  spatialBindSlots = undefined;
  renderBindGroup = undefined;
  destroyFftBlock();
  destroyVideoTexture();
  fillParams.destroy();
  filterParams.destroy();
  magParams.destroy();
  spatialParams.destroy();
  displayFb.destroy();
  videoBlitTargetPx.destroy();
  root.destroy();
}

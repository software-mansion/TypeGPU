import {
  createFft2d,
  createStockhamRadix4LineStrategy,
  decomposeWorkgroups,
  log2Int,
  nextPowerOf2,
  radix4LineStageCount,
  stockhamStageCount,
  stockhamTwiddleLutVec2Count,
  type Fft2d,
} from '@typegpu/fft';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

/**
 * Pipeline: camera → luminance (optional separable Hann edge window) → `encodeForward` → radial low-pass
 * on `pingPong[spectrumSlot]` → optional `encodeInverse` (spatial) or log-magnitude spectrum.
 * By default the 2D FFT uses **radix-2 Stockham** (`lineFft=default`); optional **radix-4** via `lineFft` /
 * `?lineFft=radix4` for fewer global passes. **One `queue.submit` per frame:** fill → forward → filter →
 * inverse + spatial + present, or mag + present, all on one command encoder. Separate line-FFT uniform pools
 * (forward row/col, inverse row/col) and multiple transpose uniforms avoid `writeBuffer` stomping when
 * forward and inverse are recorded together.
 * Partial inverse debugging uses the **Inverse stages (debug)** slider. While the cap is **below** a full
 * inverse on either axis, the spatial view is log-graded (not a literal image): radix-2 tends to look
 * blockier as stages accrue; radix-4 often shows
 * periodic / repeated spectrum structure until the chain completes. When the cap reaches a full inverse
 * on both axes (e.g. radix-4 line strategy on 512×512 needs 5), spatial uses normal `Re·1/(WH)` like slider −1.
 * Radix-4 inverse kernels multiply
 * by ¼ each stage, so partial results look dark vs Stockham — the example applies a **display-only**
 * tapered `4^{taper·(a+b)}` factor on the log path. **Gain** is scaled; use the **gain** slider to tune brightness.
 */

const WORKGROUP = 256;

/** Multiplies the **gain** slider for partial-inverse debug (log path). */
const PARTIAL_INVERSE_DEBUG_GAIN_SCALE = 14;
/** Inside `log(1 + …)` — lifts tiny `|c|·invSize` before grading (WGSL). */
const PARTIAL_INVERSE_DEBUG_LOG_PRESCALE = 32;

/**
 * Radix-4 inverse applies ×¼ per stage; two line passes attenuate ~4^{-(a+b)}. Full `4^{a+b}` inside
 * `log(1 + x)` often clips to white — use a **tapered** exponent (display only).
 */
const RADIX4_PARTIAL_AMP_EXPONENT_TAPER = 0.72;

/**
 * Radix-4 inverse kernels each scale by ¼; the optional Stockham tail inverse does not.
 * Partial-debug display should lift by 4^(taper·(quarterStagesRow+quarterStagesCol)) only for those
 * radix-4 inverse dispatches — not using {@link radix4LineStageCount} directly, which counts the tail too.
 */
function radix4InverseQuarterStagesRun(n: number, cap: number): number {
  const k = log2Int(n);
  const r4 = Math.floor(k / 2);
  const totalDispatches = radix4LineStageCount(n);
  let remaining = Math.min(Math.max(0, cap), totalDispatches);
  if (k % 2 === 1 && remaining > 0) {
    remaining -= 1;
  }
  return Math.min(r4, remaining);
}

function radix4PartialInverseAmpComp(
  padW: number,
  padH: number,
  inverseStagesCap: number | undefined,
  lineFftStrategyId: string,
): number {
  if (inverseStagesCap === undefined || lineFftStrategyId !== 'stockham-radix4') {
    return 1;
  }
  const a = radix4InverseQuarterStagesRun(padH, inverseStagesCap);
  const b = radix4InverseQuarterStagesRun(padW, inverseStagesCap);
  const e = (a + b) * RADIX4_PARTIAL_AMP_EXPONENT_TAPER;
  return 4 ** e;
}

/** Stages per line FFT for the active strategy (matches `dispatchLineFft` internal schedule). */
function lineFftStageCountForPad(n: number, lineFftStrategyId: string): number {
  return lineFftStrategyId === 'stockham-radix4' ? radix4LineStageCount(n) : stockhamStageCount(n);
}

/**
 * True when the debug cap truncates the inverse on at least one axis — use log-magnitude spatial debug.
 * When the cap is enough for a full inverse on both axes (e.g. 5 on 512×512 radix-4), use normal `Re·inv` spatial.
 */
function inverseStagesCapIsPartial(
  padW: number,
  padH: number,
  cap: number | undefined,
  lineFftStrategyId: string,
): boolean {
  if (cap === undefined) {
    return false;
  }
  const sw = lineFftStageCountForPad(padW, lineFftStrategyId);
  const sh = lineFftStageCountForPad(padH, lineFftStrategyId);
  return cap < sw || cap < sh;
}

/**
 * Max longer side of the camera ROI before downscale (user control); FFT pad is still
 * `nextPowerOf2(effW)×nextPowerOf2(effH)` — see `@typegpu/fft`. Video is blit to `rgba8unorm` like
 * camera-thresholding / chroma-keying.
 */
let fftMaxSide = 1024;

/**
 * TEMP: after normal downscale, clamp `effH` to at most `⌊effW/2⌋` for lighter asymmetric pads while debugging.
 * Off by default so the ROI matches camera aspect.
 */
const TEMP_CAP_EFF_HEIGHT_TO_HALF_WIDTH = false;

type LineFftMode = 'default' | 'copy' | 'radix4';

/**
 * Cap each inverse line-FFT dispatch to this many internal stages (`undefined` = full inverse).
 * Driven by the **Inverse stages (debug)** control.
 */
let inverseStagesDebugCap: number | undefined;

let lineFftMode: LineFftMode = 'default';
/** Tracks which line mode the current `fft` was built with (invalidate on change). */
let fftLineFftMode: LineFftMode | undefined;
/** Tracks debug inverse stage cap used to build `fft` (invalidate when the control changes). */
let fftDebugInverseMaxLineStages: number | undefined;

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
  const c = filterLayout.$.spectrum[tid] as d.v2f;
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
  const cShift = magLayout.$.spectrum[srcTid] as d.v2f;
  const len = std.sqrt(cShift.x * cShift.x + cShift.y * cShift.y);
  const logv = std.log(1.0 + len) * magLayout.$.params.gain;
  const cv = std.clamp(logv, 0.0, 1.0);
  std.textureStore(magLayout.$.outTex, d.vec2u(xLin, yLin), d.vec4f(cv, cv, cv, 1));
});

const spatialParamsType = d.struct({
  padW: d.u32,
  padH: d.u32,
  padWLog2: d.u32,
  padWMask: d.u32,
  /** `1 / (padW * padH)` — unnormalized Stockham inverse scaling. */
  invSize: d.f32,
  /** `1`: partial inverse debug — log-graded magnitude (see `PARTIAL_INVERSE_DEBUG_*` constants). */
  spatialPartialDebug: d.u32,
  /** Effective log path scale: **gain** × `PARTIAL_INVERSE_DEBUG_GAIN_SCALE` when partial debug is on. */
  partialLogGain: d.f32,
  /** Tapered `4^{0.72·(min(cap,R_H)+min(cap,R_W))}` for radix-4 partial debug (else `1`); display only. */
  radix4PartialAmp: d.f32,
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

  const c = spatialLayout.$.spectrum[tid] as d.v2f;
  const dbg = spatialLayout.$.params.spatialPartialDebug !== d.u32(0);
  const inv = spatialLayout.$.params.invSize;
  const len = std.sqrt(c.x * c.x + c.y * c.y);
  const gLinear = c.x * inv;
  const prescale = d.f32(PARTIAL_INVERSE_DEBUG_LOG_PRESCALE);
  const r4Amp = spatialLayout.$.params.radix4PartialAmp;
  const gLog = std.log(1.0 + len * inv * prescale * r4Amp) * spatialLayout.$.params.partialLogGain;
  const g = std.clamp(std.select(gLinear, gLog, dbg), 0.0, 1.0);
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
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 },
    },
  });
} else {
  throw new Error('getUserMedia not supported');
}

const root = await tgpu.init({
  device: { optionalFeatures: ['timestamp-query'] },
});
const device = root.device;

/** Verbose FFT / submit-path logging. Set `false` when done debugging. */
const DEBUG_FFT_SLOTS = true;

function gpuBufferLabel(buf: Fft2d['pingPong'][0]): string {
  try {
    const raw = root.unwrap(buf);
    return raw.label && raw.label.length > 0 ? raw.label : '(unlabeled buffer)';
  } catch {
    return '(unwrap failed)';
  }
}

function fftDbgLine(pairs: Record<string, string | number | boolean>): string {
  return Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .join(' | ');
}

/** Once per frame per branch: dimensions, strategy, caps, ping-pong GPUBuffer labels, line stage counts. */
function logFftFrame(
  phase: string,
  activeFft: Fft2d,
  ctx: {
    submitPath: string;
    padW: number;
    padH: number;
    effW: number;
    effH: number;
    fbW: number;
    fbH: number;
    logGpuTimingThisFrame: boolean;
  },
) {
  if (!DEBUG_FFT_SLOTS) {
    return;
  }
  const { padW, padH } = ctx;
  const rowStages =
    activeFft.lineFftStrategyId === 'stockham-radix4'
      ? radix4LineStageCount(padW)
      : stockhamStageCount(padW);
  const colStages =
    activeFft.lineFftStrategyId === 'stockham-radix4'
      ? radix4LineStageCount(padH)
      : stockhamStageCount(padH);
  const sched =
    ctx.submitPath === 'single-submit'
      ? 'singleSubmitEncoder'
      : 'multiSubmitProfileForward';
  console.log(
    `[camera-fft dbg] ${phase} | tMs=${performance.now().toFixed(2)} | ${fftDbgLine({
      submitPath: ctx.submitPath,
      sched,
      padW: ctx.padW,
      padH: ctx.padH,
      effW: ctx.effW,
      effH: ctx.effH,
      fbW: ctx.fbW,
      fbH: ctx.fbH,
      logGpuTiming: ctx.logGpuTimingThisFrame,
      applyInverseFft,
      lineFft: activeFft.lineFftStrategyId,
      skipFinalT: activeFft.skipFinalTranspose,
      invStagesCap: inverseStagesDebugCap ?? -1,
      gain: gainValue,
      cutoff: cutoffRadiusNorm,
      edgeWin: applyEdgeWindow,
      buf0: gpuBufferLabel(activeFft.pingPong[0]),
      buf1: gpuBufferLabel(activeFft.pingPong[1]),
      rowSt: rowStages,
      colSt: colStages,
    })}`,
  );
}

function logFftSlots(message: string, pairs: Record<string, string | number | boolean>) {
  if (!DEBUG_FFT_SLOTS) {
    return;
  }
  console.log(
    `[camera-fft slots] ${message} | tMs=${performance.now().toFixed(2)} | ${fftDbgLine(pairs)}`,
  );
}

/** Omit final spectrum transpose (matches `createFft2d`); saves one global transpose after column FFT. */
const SKIP_FINAL_FFT_TRANSPOSE = true;

/** GPU timestamps: fill 0–1, filter 2–3, spatial or mag 4–5. */
const PROFILE_QUERY_COUNT = 6;
/**
 * GPU intervals when `timestamp-query` is enabled: fill 0–1, filter 2–3, tail compute 4–5 (spatial or mag).
 */
const profileQuerySet = root.enabledFeatures.has('timestamp-query')
  ? root.createQuerySet('timestamp', PROFILE_QUERY_COUNT)
  : null;

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
let applyInverseFft = true;
let gainValue = 0.12;
/** Normalized low-pass cutoff vs max toroidal radius (1 = no filtering). */
let cutoffRadiusNorm = 1;
/** Separable Hann window on camera ROI before FFT (reduces periodic-boundary cross in spectrum). */
let applyEdgeWindow = false;
let logGpuTiming = false;
let lastGpuTimingLogMs = 0;
let gpuTimingReadPending = false;
/** Wall time for last full `processVideoFrame` (after resource guards), for comparing to GPU timestamp subset. */
let lastCallbackWallMs = 0;
let lastMagUniformKey = '';
let lastSpatialUniformKey = '';
let lastFilterUniformKey = '';

function timestampPeriodNs(): number {
  const limits = device.limits as { timestampPeriod?: number };
  return typeof limits.timestampPeriod === 'number' ? limits.timestampPeriod : 1;
}

function ticksToMs(delta: number): number {
  return (delta * timestampPeriodNs()) / 1e6;
}

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
  if (TEMP_CAP_EFF_HEIGHT_TO_HALF_WIDTH) {
    const maxH = Math.max(1, Math.floor(effW / 2));
    if (effH > maxH) {
      effH = maxH;
    }
  }
  return { effW, effH };
}

let fillBindGroup: ReturnType<typeof root.createBindGroup> | undefined;
/** One bind group per ping-pong buffer; use `fft.outputSlot()` after each transform to pick the right one. */
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
  fftDebugInverseMaxLineStages = undefined;
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
  const nextDebugInverseStages = inverseStagesDebugCap;
  const needFft =
    !fft ||
    padW !== nextPadW ||
    padH !== nextPadH ||
    fftLineFftMode !== lineFftMode ||
    fftDebugInverseMaxLineStages !== nextDebugInverseStages;

  if (needFft) {
    destroyFftBlock();
    padW = nextPadW;
    padH = nextPadH;
    const lineFactory = lineFftMode === 'radix4' ? createStockhamRadix4LineStrategy : undefined;
    fft = createFft2d(root, {
      width: padW,
      height: padH,
      skipFinalTranspose: SKIP_FINAL_FFT_TRANSPOSE,
      ...(lineFactory !== undefined ? { lineFftStrategyFactory: lineFactory } : {}),
      ...(nextDebugInverseStages !== undefined
        ? { debugInverseMaxLineStages: nextDebugInverseStages }
        : {}),
    });
    fftLineFftMode = lineFftMode;
    fftDebugInverseMaxLineStages = nextDebugInverseStages;
    lastMagUniformKey = '';
    lastFilterUniformKey = '';
    {
      const lutN = Math.max(padW, padH);
      const lutVec2 = stockhamTwiddleLutVec2Count(lutN);
      const invDbg =
        nextDebugInverseStages !== undefined
          ? ` | DEBUG inverse line stages ≤${nextDebugInverseStages} per dispatch`
          : '';
      console.info(
        `[camera-fft] FFT ${padW}×${padH} | lineFft=${lineFftMode} lineFftStrategyId=${fft.lineFftStrategyId} | twiddle LUT ${lutVec2} vec2 (~${((lutVec2 * 8) / 1024).toFixed(1)} KiB) | useGlobalTranspose=${fft.useGlobalTranspose} skipFinalTranspose=${fft.skipFinalTranspose} (filter/mag use swapped freq axes when true)${invDbg}`,
      );
    }

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
          spectrum: fft.pingPong[0],
          params: magParams,
          outTex: displayStorageView,
        }),
        root.createBindGroup(magLayout, {
          spectrum: fft.pingPong[1],
          params: magParams,
          outTex: displayStorageView,
        }),
      ];
    }
    if (!filterBindSlots) {
      filterBindSlots = [
        root.createBindGroup(filterLayout, {
          spectrum: fft.pingPong[0],
          params: filterParams,
        }),
        root.createBindGroup(filterLayout, {
          spectrum: fft.pingPong[1],
          params: filterParams,
        }),
      ];
    }
    if (!spatialBindSlots) {
      spatialBindSlots = [
        root.createBindGroup(spatialLayout, {
          spectrum: fft.pingPong[0],
          params: spatialParams,
          outTex: displayStorageView,
        }),
        root.createBindGroup(spatialLayout, {
          spectrum: fft.pingPong[1],
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

  const wallT0 = performance.now();

  const { effW, effH } = effectiveFrameSize(frameWidth, frameHeight);

  videoBlitTargetPx.write({ w: effW, h: effH });
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
  fillParams.write({
    videoW: effW,
    videoH: effH,
    padW,
    padH,
    padWLog2,
    padWMask: padW - 1,
    edgeWindow: applyEdgeWindow ? 1 : 0,
  });

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

  const invStagesCap = inverseStagesDebugCap;
  const spatialUniformKey = `${padW}x${padH}x${invStagesCap ?? 'full'}x${activeFft.lineFftStrategyId}x${
    invStagesCap !== undefined ? gainValue : ''
  }`;
  if (spatialUniformKey !== lastSpatialUniformKey) {
    lastSpatialUniformKey = spatialUniformKey;
    const partialDebug = inverseStagesCapIsPartial(
      padW,
      padH,
      invStagesCap,
      activeFft.lineFftStrategyId,
    );
    spatialParams.write({
      padW,
      padH,
      padWLog2,
      padWMask: padW - 1,
      invSize: 1 / (padW * padH),
      spatialPartialDebug: partialDebug ? 1 : 0,
      partialLogGain: partialDebug ? gainValue * PARTIAL_INVERSE_DEBUG_GAIN_SCALE : gainValue,
      radix4PartialAmp: radix4PartialInverseAmpComp(
        padW,
        padH,
        invStagesCap,
        activeFft.lineFftStrategyId,
      ),
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
  displayFb.write({
    fbW,
    fbH,
    padW,
    padH,
    effW,
    effH,
    viewMode: applyInverseFft ? 1 : 0,
  });

  const qs = profileQuerySet;

  if (logGpuTiming && qs) {
    logFftFrame('frame (start)', activeFft, {
      submitPath: 'single-submit',
      padW,
      padH,
      effW,
      effH,
      fbW,
      fbH,
      logGpuTimingThisFrame: true,
    });
    const encTimed = device.createCommandEncoder({ label: 'camera-fft frame (timed)' });
    {
      const fillPass = encTimed.beginComputePass({
        label: 'camera-fft fill',
        timestampWrites: {
          querySet: qs.querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      });
      fillPipeline.with(fillPass).with(fillBindGroup).dispatchWorkgroups(gx, gy, gz);
      fillPass.end();
    }
    activeFft.encodeForward(encTimed);
    const spectrumSlotTimed = activeFft.outputSlot();
    logFftSlots('after encodeForward (single CB, GPU timing path)', {
      path: 'frameCb',
      spectrumSlot: spectrumSlotTimed,
      spectrumGpuBuffer: gpuBufferLabel(activeFft.pingPong[spectrumSlotTimed]),
      logGpuTiming: true,
      applyInverseFft,
    });
    {
      const filterPass = encTimed.beginComputePass({
        label: 'camera-fft filter',
        timestampWrites: {
          querySet: qs.querySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 3,
        },
      });
      filterPipeline
        .with(filterPass)
        .with(filterBindSlots[spectrumSlotTimed])
        .dispatchWorkgroups(gx, gy, gz);
      filterPass.end();
    }
    logFftSlots('after filter (single CB, GPU timing path)', {
      outputSlot: activeFft.outputSlot(),
      expectedUnchangedSpectrumSlot: spectrumSlotTimed,
      slotMatches: activeFft.outputSlot() === spectrumSlotTimed,
      filteredSpectrumGpuBuffer: gpuBufferLabel(activeFft.pingPong[spectrumSlotTimed]),
    });
    if (applyInverseFft) {
      logFftSlots('before encodeInverse (single CB, GPU timing path)', {
        outputSlot: activeFft.outputSlot(),
        expectedSpectrumSlot: spectrumSlotTimed,
        match: activeFft.outputSlot() === spectrumSlotTimed,
      });
      activeFft.encodeInverse(encTimed);
      const spatialSlotTimed = activeFft.outputSlot();
      logFftSlots('after encodeInverse (single CB, GPU timing path)', {
        spatialSlot: spatialSlotTimed,
        spatialReadGpuBuffer: gpuBufferLabel(activeFft.pingPong[spatialSlotTimed]),
      });
      {
        const sp = encTimed.beginComputePass({
          label: 'camera-fft spatial',
          timestampWrites: {
            querySet: qs.querySet,
            beginningOfPassWriteIndex: 4,
            endOfPassWriteIndex: 5,
          },
        });
        spatialPipeline
          .with(sp)
          .with(spatialBindSlots[spatialSlotTimed])
          .dispatchWorkgroups(gx, gy, gz);
        sp.end();
      }
    } else {
      {
        const mp = encTimed.beginComputePass({
          label: 'camera-fft mag',
          timestampWrites: {
            querySet: qs.querySet,
            beginningOfPassWriteIndex: 4,
            endOfPassWriteIndex: 5,
          },
        });
        magPipeline.with(mp).with(magBindSlots[spectrumSlotTimed]).dispatchWorkgroups(gx, gy, gz);
        mp.end();
      }
    }
    renderPipeline
      .with(encTimed)
      .withColorAttachment({
        view: context,
        clearValue: [0.02, 0.02, 0.05, 1],
      })
      .with(renderBindGroup)
      .draw(3);
    device.queue.submit([encTimed.finish()]);
  } else {
    const enc = device.createCommandEncoder({ label: 'camera-fft frame' });
    {
      const fillPass = enc.beginComputePass({ label: 'camera-fft fill' });
      fillPipeline.with(fillPass).with(fillBindGroup).dispatchWorkgroups(gx, gy, gz);
      fillPass.end();
    }
    activeFft.encodeForward(enc);
    const spectrumSlot = activeFft.outputSlot();
    logFftSlots('after encodeForward (single CB, non-timing path)', {
      path: 'frameCb',
      spectrumSlot,
      spectrumGpuBuffer: gpuBufferLabel(activeFft.pingPong[spectrumSlot]),
      logGpuTiming: false,
      applyInverseFft,
    });
    {
      const p = enc.beginComputePass({ label: 'camera-fft filter' });
      filterPipeline.with(p).with(filterBindSlots[spectrumSlot]).dispatchWorkgroups(gx, gy, gz);
      p.end();
    }
    logFftSlots('after filter (single CB, non-timing path)', {
      outputSlot: activeFft.outputSlot(),
      expectedUnchangedSpectrumSlot: spectrumSlot,
      slotMatches: activeFft.outputSlot() === spectrumSlot,
      filteredSpectrumGpuBuffer: gpuBufferLabel(activeFft.pingPong[spectrumSlot]),
    });
    if (applyInverseFft) {
      logFftSlots('before encodeInverse (single CB, non-timing path)', {
        outputSlot: activeFft.outputSlot(),
        expectedSpectrumSlot: spectrumSlot,
        match: activeFft.outputSlot() === spectrumSlot,
      });
      activeFft.encodeInverse(enc);
      const spatialSlot = activeFft.outputSlot();
      logFftSlots('after encodeInverse (single CB, non-timing path)', {
        spatialSlot,
        spatialReadGpuBuffer: gpuBufferLabel(activeFft.pingPong[spatialSlot]),
      });
      {
        const p = enc.beginComputePass({ label: 'camera-fft spatial' });
        spatialPipeline.with(p).with(spatialBindSlots[spatialSlot]).dispatchWorkgroups(gx, gy, gz);
        p.end();
      }
    } else {
      {
        const p = enc.beginComputePass({ label: 'camera-fft mag' });
        magPipeline.with(p).with(magBindSlots[spectrumSlot]).dispatchWorkgroups(gx, gy, gz);
        p.end();
      }
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
  }

  lastCallbackWallMs = performance.now() - wallT0;

  if (
    logGpuTiming &&
    qs &&
    !gpuTimingReadPending &&
    performance.now() - lastGpuTimingLogMs >= 1000
  ) {
    const query = qs;
    const snapshotCallbackWallMs = lastCallbackWallMs;
    gpuTimingReadPending = true;
    lastGpuTimingLogMs = performance.now();
    void device.queue.onSubmittedWorkDone().then(async () => {
      try {
        query.resolve();
        const r = await query.read();
        const fillMs = ticksToMs(Number(r[1] - r[0]));
        const filterMs = ticksToMs(Number(r[3] - r[2]));
        const tailMs = ticksToMs(Number(r[5] - r[4]));
        const wallFps = snapshotCallbackWallMs > 0 ? 1000 / snapshotCallbackWallMs : 0;
        console.debug(
          `[camera-fft] GPU fill ~${fillMs.toFixed(3)} ms | filter ~${filterMs.toFixed(3)} ms | spatial|mag ~${tailMs.toFixed(3)} ms | one submit | callback wall ~${snapshotCallbackWallMs.toFixed(2)} ms (~${wallFps.toFixed(1)} Hz)`,
        );
      } finally {
        gpuTimingReadPending = false;
      }
    });
  } else if (logGpuTiming && !qs && performance.now() - lastGpuTimingLogMs >= 1000) {
    lastGpuTimingLogMs = performance.now();
    console.debug(
      '[camera-fft] GPU timing needs timestamp-query support (no GPU timers on this device)',
    );
  }

  spinner.style.display = 'none';

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}

videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

export const controls = defineControls({
  inverseFft: {
    initial: true,
    onToggleChange: (value) => {
      applyInverseFft = value;
    },
  },
  edgeWindow: {
    initial: false,
    onToggleChange: (value) => {
      applyEdgeWindow = value;
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
    options: ['radix4', 'default', 'copy'],
    onSelectChange: (value) => {
      lineFftMode = value as LineFftMode;
    },
  },
  gpuTiming: {
    initial: false,
    onToggleChange: (value) => {
      logGpuTiming = value;
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
  'Inverse stages (debug)': {
    initial: -1,
    min: -1,
    max: 16,
    step: 1,
    onSliderChange: (value) => {
      inverseStagesDebugCap = value < 0 ? undefined : value;
      lastSpatialUniformKey = '';
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
  profileQuerySet?.destroy();
  root.destroy();
}

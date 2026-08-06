import { tgpu, d, std, type StorageFlag, type TgpuBindGroup, type TgpuBuffer } from 'typegpu';
import { createRadixSorter, type Sorter } from '@typegpu/sort';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import {
  createSogDecoder,
  loadSogScene,
  type PosColorBuffer,
  type RotScaleBuffer,
  type SogScene,
} from './sog.ts';

const WORKGROUP_SIZE = 256;
const NEAR_PLANE = 0.15;
const MAX_SIGMA_RADIUS = 3;
const MAX_SIGMA_PIXELS = 340;
const ALPHA_CUTOFF = 1.5 / 255;

const maxBufferSize = await navigator.gpu.requestAdapter().then((adapter) => {
  if (!adapter) {
    throw new Error('No GPU adapter found');
  }
  return Math.min(adapter.limits.maxStorageBufferBindingSize, adapter.limits.maxBufferSize);
});

const root = await tgpu.init({
  device: {
    requiredLimits: {
      maxStorageBufferBindingSize: maxBufferSize,
      maxBufferSize: maxBufferSize,
    },
  },
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const countOptions = {
  '500k': 500_000,
  '1M': 1_000_000,
  '2.5M': 2_500_000,
  '5M': 5_000_000,
  '10M (full)': 9_999_999,
} as const;
type CountKey = keyof typeof countOptions;

const availableCounts = (Object.keys(countOptions) as CountKey[]).filter(
  (key) => countOptions[key] * 16 <= maxBufferSize,
);
const initialCount: CountKey = availableCounts.includes('2.5M')
  ? '2.5M'
  : availableCounts[availableCounts.length - 1];

const state = {
  sortEachFrame: true,
  needsSort: false,
};

// #region Uniforms and layouts

const Params = d.struct({
  viewport: d.vec2f,
  splatScale: d.f32,
  flip: d.f32,
});

const IndirectDraw = d.struct({
  vertexCount: d.u32,
  instanceCount: d.atomic(d.u32),
  firstVertex: d.u32,
  firstInstance: d.u32,
});

const cameraUniform = root.createUniform(Camera);
const params = root.createUniform(Params, {
  viewport: d.vec2f(1, 1),
  splatScale: 1,
  flip: -1,
});

const projectLayout = tgpu.bindGroupLayout({
  posColor: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  rotScale: { storage: d.arrayOf(d.vec2u), access: 'readonly' },
  scaleCodebook: { storage: d.arrayOf(d.f32), access: 'readonly' },
  keys: { storage: d.arrayOf(d.f32), access: 'mutable' },
  indices: { storage: d.arrayOf(d.u32), access: 'mutable' },
  projected: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
  projectedMeta: { storage: d.arrayOf(d.vec2u), access: 'mutable' },
  indirectDraw: { storage: IndirectDraw, access: 'mutable' },
});

const indirectLayout = tgpu.bindGroupLayout({
  indirectDraw: { storage: IndirectDraw, access: 'mutable' },
});

const renderLayout = tgpu.bindGroupLayout({
  projected: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  projectedMeta: { storage: d.arrayOf(d.vec2u), access: 'readonly' },
  sortedIndices: { storage: d.arrayOf(d.u32), access: 'readonly' },
});

// #endregion

// #region Shaders

const worldPosition = (packed: d.v4f) => {
  'use gpu';
  return d.vec3f(packed.x, packed.y * params.$.flip, packed.z * params.$.flip);
};

const covarianceMul = (
  sxx: number,
  sxy: number,
  sxz: number,
  syy: number,
  syz: number,
  szz: number,
  v: d.v3f,
) => {
  'use gpu';
  return d.vec3f(
    sxx * v.x + sxy * v.y + sxz * v.z,
    sxy * v.x + syy * v.y + syz * v.z,
    sxz * v.x + syz * v.y + szz * v.z,
  );
};

const SQRT_2 = Math.sqrt(2);

const resetKernel = tgpu.computeFn({ workgroupSize: [1] })(() => {
  'use gpu';
  std.atomicStore(indirectLayout.$.indirectDraw.instanceCount, 0);
});

const projectKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  const idx = input.gid.x;
  if (idx >= projectLayout.$.keys.length) {
    return;
  }

  const packed = d.vec4f(projectLayout.$.posColor[idx]);
  const colorBits = std.bitcast(d.f32, d.u32)(packed.w);
  const alpha = std.unpack4x8unorm(colorBits).w;

  const pos = worldPosition(packed);
  const viewPos = cameraUniform.$.view * d.vec4f(pos, 1);
  const depth = -viewPos.z;

  let key = d.f32(-1e30);
  let center = d.vec2f();
  let axis1 = d.vec2f();
  let axis2 = d.vec2f();
  let radius = d.f32(0);

  if (depth > NEAR_PLANE && alpha > ALPHA_CUTOFF) {
    const rotScale = projectLayout.$.rotScale[idx];

    const q = std.unpack4x8unorm(rotScale.x);
    const qmode = d.u32(q.w * 255 + 0.5) - 252;
    const abc = (q.xyz - 0.5) * SQRT_2;
    const qd = std.sqrt(std.max(0, 1 - std.dot(abc, abc)));

    let qs = qd;
    let qx = abc.x;
    let qy = abc.y;
    let qz = abc.z;
    if (qmode === 1) {
      qs = abc.x;
      qx = qd;
      qy = abc.y;
      qz = abc.z;
    } else if (qmode === 2) {
      qs = abc.x;
      qx = abc.y;
      qy = qd;
      qz = abc.z;
    } else if (qmode === 3) {
      qs = abc.x;
      qx = abc.y;
      qy = abc.z;
      qz = qd;
    }

    const scaleMul = params.$.splatScale;
    const s0 = projectLayout.$.scaleCodebook[rotScale.y & 0xff] * scaleMul;
    const s1 = projectLayout.$.scaleCodebook[(rotScale.y >> 8) & 0xff] * scaleMul;
    const s2 = projectLayout.$.scaleCodebook[(rotScale.y >> 16) & 0xff] * scaleMul;

    const flipVec = d.vec3f(1, params.$.flip, params.$.flip);
    const m0 =
      d.vec3f(1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qs * qz), 2 * (qx * qz - qs * qy)) *
      flipVec *
      s0;
    const m1 =
      d.vec3f(2 * (qx * qy - qs * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qs * qx)) *
      flipVec *
      s1;
    const m2 =
      d.vec3f(2 * (qx * qz + qs * qy), 2 * (qy * qz - qs * qx), 1 - 2 * (qx * qx + qy * qy)) *
      flipVec *
      s2;

    const r0 = d.vec3f(m0.x, m1.x, m2.x);
    const r1 = d.vec3f(m0.y, m1.y, m2.y);
    const r2 = d.vec3f(m0.z, m1.z, m2.z);
    const sxx = std.dot(r0, r0);
    const sxy = std.dot(r0, r1);
    const sxz = std.dot(r0, r2);
    const syy = std.dot(r1, r1);
    const syz = std.dot(r1, r2);
    const szz = std.dot(r2, r2);

    const wr0 = d.vec3f(
      cameraUniform.$.view.columns[0].x,
      cameraUniform.$.view.columns[1].x,
      cameraUniform.$.view.columns[2].x,
    );
    const wr1 = d.vec3f(
      cameraUniform.$.view.columns[0].y,
      cameraUniform.$.view.columns[1].y,
      cameraUniform.$.view.columns[2].y,
    );
    const wr2 = d.vec3f(
      cameraUniform.$.view.columns[0].z,
      cameraUniform.$.view.columns[1].z,
      cameraUniform.$.view.columns[2].z,
    );

    const viewport = d.vec2f(params.$.viewport);
    const fx = cameraUniform.$.projection.columns[0].x * viewport.x * 0.5;
    const fy = cameraUniform.$.projection.columns[1].y * viewport.y * 0.5;

    const invDepth = 1 / depth;
    const tRow0 = wr0 * (fx * invDepth) + wr2 * (fx * viewPos.x * invDepth * invDepth);
    const tRow1 = wr1 * (fy * invDepth) + wr2 * (fy * viewPos.y * invDepth * invDepth);

    const c0 = covarianceMul(sxx, sxy, sxz, syy, syz, szz, tRow0);
    const covA = std.dot(tRow0, c0) + 0.3;
    const covB = std.dot(tRow1, c0);
    const covC = std.dot(tRow1, covarianceMul(sxx, sxy, sxz, syy, syz, szz, tRow1)) + 0.3;

    const mid = 0.5 * (covA + covC);
    const det = covA * covC - covB * covB;
    const disc = std.sqrt(std.max(mid * mid - det, 1e-8));
    const sigma1 = std.min(std.sqrt(mid + disc), MAX_SIGMA_PIXELS);
    const sigma2 = std.min(std.sqrt(std.max(mid - disc, 1e-8)), MAX_SIGMA_PIXELS);

    let ev = d.vec2f(1, 0);
    if (std.abs(covB) > 1e-8) {
      ev = std.normalize(d.vec2f(covB, mid + disc - covA));
    } else if (covC > covA) {
      ev = d.vec2f(0, 1);
    }

    radius = std.min(std.sqrt(2 * std.log(255 * alpha)), MAX_SIGMA_RADIUS);

    const ndcPerPixel = d.vec2f(2, 2) / viewport;
    axis1 = ev * (sigma1 * radius) * ndcPerPixel;
    axis2 = d.vec2f(-ev.y, ev.x) * (sigma2 * radius) * ndcPerPixel;

    const clip = cameraUniform.$.projection * viewPos;
    center = clip.xy * (1 / clip.w);

    const extent = d.vec2f(
      std.abs(axis1.x) + std.abs(axis2.x),
      std.abs(axis1.y) + std.abs(axis2.y),
    );
    const onScreen =
      center.x - extent.x < 1 &&
      center.x + extent.x > -1 &&
      center.y - extent.y < 1 &&
      center.y + extent.y > -1;

    if (onScreen) {
      key = depth;
      std.atomicAdd(projectLayout.$.indirectDraw.instanceCount, 1);
    } else {
      radius = d.f32(0);
      axis1 = d.vec2f();
      axis2 = d.vec2f();
    }
  }

  projectLayout.$.keys[idx] = key;
  projectLayout.$.indices[idx] = idx;
  projectLayout.$.projected[idx] = d.vec4f(
    center,
    std.bitcast(d.u32, d.f32)(std.pack2x16float(axis1)),
    std.bitcast(d.u32, d.f32)(std.pack2x16float(axis2)),
  );
  projectLayout.$.projectedMeta[idx] = d.vec2u(colorBits, std.bitcast(d.f32, d.u32)(radius));
});

const splatVertex = tgpu.vertexFn({
  in: { vid: d.builtin.vertexIndex, iid: d.builtin.instanceIndex },
  out: { position: d.builtin.position, gauss: d.vec2f, color: d.vec4f },
})((input) => {
  'use gpu';
  const splatIdx = renderLayout.$.sortedIndices[input.iid];
  const projected = d.vec4f(renderLayout.$.projected[splatIdx]);
  const meta = renderLayout.$.projectedMeta[splatIdx];

  const axis1 = std.unpack2x16float(std.bitcast(d.f32, d.u32)(projected.z));
  const axis2 = std.unpack2x16float(std.bitcast(d.f32, d.u32)(projected.w));
  const radius = std.bitcast(d.u32, d.f32)(meta.y);

  const cornerX = d.f32(2 * d.i32(input.vid & 1) - 1);
  const cornerY = d.f32(2 * d.i32(input.vid >> 1) - 1);

  return {
    position: d.vec4f(projected.xy + axis1 * cornerX + axis2 * cornerY, 0, 1),
    gauss: d.vec2f(cornerX, cornerY) * radius,
    color: std.unpack4x8unorm(meta.x),
  };
});

const splatFragment = tgpu.fragmentFn({
  in: { gauss: d.vec2f, color: d.vec4f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const alpha = input.color.w * std.exp(-0.5 * std.dot(input.gauss, input.gauss));
  return d.vec4f(input.color.xyz, alpha);
});

// #endregion

// #region Pipelines

const resetPipeline = root.createComputePipeline({ compute: resetKernel });
const projectPipeline = root.createComputePipeline({ compute: projectKernel });

const renderPipeline = root.createRenderPipeline({
  vertex: splatVertex,
  fragment: splatFragment,
  primitive: { topology: 'triangle-strip' },
  targets: {
    format: presentationFormat,
    blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    },
  },
});

const decoder = createSogDecoder(root);

const indirectBuffer = root
  .createBuffer(IndirectDraw, {
    vertexCount: 4,
    instanceCount: 0,
    firstVertex: 0,
    firstInstance: 0,
  })
  .$usage('storage', 'indirect');
const indirectBindGroup = root.createBindGroup(indirectLayout, { indirectDraw: indirectBuffer });

// #endregion

// #region Scene lifecycle

interface SceneResources {
  count: number;
  sorter: Sorter;
  projectBindGroup: TgpuBindGroup<(typeof projectLayout)['entries']>;
  renderBindGroup: TgpuBindGroup<(typeof renderLayout)['entries']>;
  destroy(): void;
}

let scene: SceneResources | null = null;
let cachedSogScene: SogScene | null = null;
let loadToken = 0;

function buildScene(sogScene: SogScene, targetCount: number): SceneResources {
  const count = Math.min(targetCount, sogScene.meta.count);

  const posColor = root.createBuffer(d.arrayOf(d.vec4f, count)).$usage('storage') as PosColorBuffer;
  const rotScale = root.createBuffer(d.arrayOf(d.vec2u, count)).$usage('storage') as RotScaleBuffer;
  const keys = root.createBuffer(d.arrayOf(d.f32, count)).$usage('storage');
  const values = root.createBuffer(d.arrayOf(d.u32, count)).$usage('storage');
  const projected = root.createBuffer(d.arrayOf(d.vec4f, count)).$usage('storage');
  const projectedMeta = root.createBuffer(d.arrayOf(d.vec2u, count)).$usage('storage');
  const scaleCodebook = root
    .createBuffer(d.arrayOf(d.f32, 256), sogScene.meta.scales.codebook.map(Math.exp))
    .$usage('storage');

  decoder.decode(sogScene, count, posColor, rotScale);

  const sorter = createRadixSorter(root, keys, { direction: 'descending', values });

  return {
    count,
    sorter,
    projectBindGroup: root.createBindGroup(projectLayout, {
      posColor,
      rotScale,
      scaleCodebook,
      keys,
      indices: values,
      projected,
      projectedMeta,
      indirectDraw: indirectBuffer,
    }),
    renderBindGroup: root.createBindGroup(renderLayout, {
      projected,
      projectedMeta,
      sortedIndices: values,
    }),
    destroy() {
      sorter.destroy();
      for (const buffer of [
        posColor,
        rotScale,
        keys,
        values,
        projected,
        projectedMeta,
        scaleCodebook,
      ]) {
        (buffer as TgpuBuffer<d.AnyWgslData> & StorageFlag).destroy();
      }
    },
  };
}

async function loadScene(targetCount: number) {
  const token = ++loadToken;
  showOverlay('Loading...');

  try {
    if (!cachedSogScene) {
      const loaded = await loadSogScene((message) => {
        if (token === loadToken) {
          showOverlay(message);
        }
      });
      if (token !== loadToken) {
        for (const bitmap of Object.values(loaded.images)) {
          bitmap.close();
        }
        return;
      }
      cachedSogScene = loaded;
    }

    showOverlay('Decoding splats...');
    const next = buildScene(cachedSogScene, targetCount);
    scene?.destroy();
    scene = next;
    state.needsSort = true;
    hideOverlay();
  } catch (error) {
    showOverlay(`Loading failed: ${error instanceof Error ? error.message : error}`, false);
    throw error;
  }
}

// #endregion

// #region Overlay

const overlay = document.getElementById('splat-overlay') as HTMLDivElement;
const spinnerEl = document.getElementById('splat-spinner') as HTMLDivElement;
const statusEl = document.getElementById('splat-status') as HTMLSpanElement;
const attributionEl = document.getElementById('splat-attribution') as HTMLDivElement;
canvas.parentElement?.appendChild(overlay);
canvas.parentElement?.appendChild(attributionEl);

let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;

function showOverlay(text: string, showSpinner = true) {
  if (hideTimeoutId !== null) {
    clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }
  spinnerEl.hidden = !showSpinner;
  statusEl.textContent = text;
  overlay.hidden = false;
  overlay.classList.add('visible');
}

function hideOverlay() {
  hideTimeoutId = setTimeout(() => {
    hideTimeoutId = null;
    overlay.classList.remove('visible');
    overlay.addEventListener('transitionend', () => (overlay.hidden = true), { once: true });
  }, 300);
}

// #endregion

// #region Frame loop

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(0, 0.6, 5, 1),
    minZoom: 0.3,
    maxZoom: 60,
  },
  (updates) => cameraUniform.patch(updates),
);

let lastViewportWidth = 0;
let lastViewportHeight = 0;
let frameId = 0;

function frame() {
  frameId = requestAnimationFrame(frame);
  if (!scene) {
    return;
  }

  if (canvas.width !== lastViewportWidth || canvas.height !== lastViewportHeight) {
    lastViewportWidth = canvas.width;
    lastViewportHeight = canvas.height;
    params.patch({ viewport: d.vec2f(canvas.width, canvas.height) });
  }

  const encoder = root['~unstable'].createCommandEncoder();

  const pass = encoder.beginComputePass();
  resetPipeline.with(indirectBindGroup).with(pass).dispatchWorkgroups(1);
  projectPipeline
    .with(scene.projectBindGroup)
    .with(pass)
    .dispatchWorkgroups(Math.ceil(scene.count / WORKGROUP_SIZE));
  if (state.sortEachFrame || state.needsSort) {
    state.needsSort = false;
    scene.sorter.run({ pass });
  }
  pass.end();

  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      },
    ],
  });
  renderPipeline.with(scene.renderBindGroup).with(renderPass).drawIndirect(indirectBuffer);
  renderPass.end();

  encoder.submit();
}

frameId = requestAnimationFrame(frame);

// #endregion

// #region Example controls and cleanup

export const controls = defineControls({
  'splat count': {
    initial: initialCount,
    options: availableCounts,
    onSelectChange: (value) => {
      void loadScene(countOptions[value]);
    },
  },
  'sort every frame': {
    initial: true,
    onToggleChange: (value) => {
      state.sortEachFrame = value;
    },
  },
  'sort now': {
    onButtonClick: () => {
      state.needsSort = true;
    },
  },
  'splat scale': {
    initial: 1,
    min: 0.1,
    max: 2,
    step: 0.05,
    onSliderChange: (value) => {
      params.patch({ splatScale: value });
    },
  },
});

export function onCleanup() {
  loadToken++;
  cancelAnimationFrame(frameId);
  if (hideTimeoutId !== null) {
    clearTimeout(hideTimeoutId);
  }
  cleanupCamera();
  if (cachedSogScene) {
    for (const bitmap of Object.values(cachedSogScene.images)) {
      bitmap.close();
    }
    cachedSogScene = null;
  }
  scene = null;
  root.destroy();
}

// #endregion

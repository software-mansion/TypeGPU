import tgpu, { d, std } from 'typegpu';
import { type BitonicSorter, createBitonicSorter } from '@typegpu/sort';
import { randf } from '@typegpu/noise';
import { fullScreenTriangle } from 'typegpu/common';
import { decomposeWorkgroups } from './decomposeWorkgroups.ts';

const maxBufferSize = await navigator.gpu.requestAdapter().then((adapter) => {
  if (!adapter) {
    throw new Error('No GPU adapter found');
  }
  const limits = adapter.limits;
  return Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize);
});

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
    requiredLimits: {
      maxStorageBufferBindingSize: maxBufferSize,
      maxBufferSize: maxBufferSize,
    },
  },
});
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');
const querySet = hasTimestampQuery ? root.createQuerySet('timestamp', 2) : null;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const maxSide = Math.floor(Math.sqrt(maxBufferSize / 4));
const minLog = Math.log2(4);
const maxLog = Math.floor(Math.log2(maxSide));
const arraySizeOptions = Array.from({ length: 8 }, (_, i) => {
  const side = Math.round(2 ** (minLog + (i * (maxLog - minLog)) / 7));
  return side * side;
});

const state = {
  arraySize: arraySizeOptions[0],
  sortOrder: 'ascending' as 'ascending' | 'descending',
};

const WORKGROUP_SIZE = 256;

const renderLayout = tgpu.bindGroupLayout({
  data: {
    storage: d.arrayOf(d.u32),
    access: 'readonly',
  },
});

const initLayout = tgpu.bindGroupLayout({
  data: {
    storage: d.arrayOf(d.u32),
    access: 'mutable',
  },
});

const initLength = root.createUniform(d.u32, state.arraySize);
const initSeed = root.createUniform(d.f32, 0);

const fragmentFn = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const arrayLength = renderLayout.$.data.length;
  const maxValue = d.u32(255);

  const cols = d.u32(std.ceil(std.sqrt(d.f32(arrayLength))));
  const rows = d.u32(std.ceil(arrayLength / cols));

  const col = d.u32(std.floor(input.uv.x * d.f32(cols)));
  const row = d.u32(std.floor(input.uv.y * d.f32(rows)));
  const idx = row * cols + col;

  if (idx >= arrayLength) {
    return d.vec4f(0.1, 0.1, 0.1, 1);
  }

  const value = renderLayout.$.data[idx];
  const normalized = value / maxValue;

  return d.vec4f(normalized, normalized, normalized, 1);
});

const initKernel = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const spanX = input.numWorkgroups.x * WORKGROUP_SIZE;
  const spanY = input.numWorkgroups.y * spanX;
  const idx = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  if (idx >= initLength.$) {
    return;
  }

  randf.seed3(
    d.vec3f(d.f32(idx & 0xffff), d.f32(idx >> 16), initSeed.$),
  );
  const n = randf.sample();
  initLayout.$.data[idx] = d.u32(std.floor(n * 256.0));
});

const renderPipeline = root['~unstable'].createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: fragmentFn,
  targets: { format: presentationFormat },
});

const initPipeline = root['~unstable'].withCompute(initKernel).createPipeline();

let buffer = root.createBuffer(d.arrayOf(d.u32, state.arraySize)).$usage(
  'storage',
);

let bindGroup = root.createBindGroup(renderLayout, {
  data: buffer,
});

let initBindGroup = root.createBindGroup(initLayout, {
  data: buffer,
});

let ascendingSorter: BitonicSorter = createBitonicSorter(root, buffer);
let descendingSorter: BitonicSorter = createBitonicSorter(root, buffer, {
  compare: (a, b) => {
    'use gpu';
    return a > b;
  },
  paddingValue: 0,
});

function recreateBuffer() {
  ascendingSorter.destroy();
  descendingSorter.destroy();
  buffer.destroy();

  buffer = root.createBuffer(d.arrayOf(d.u32, state.arraySize)).$usage(
    'storage',
  );

  bindGroup = root.createBindGroup(renderLayout, {
    data: buffer,
  });

  initBindGroup = root.createBindGroup(initLayout, {
    data: buffer,
  });

  ascendingSorter = createBitonicSorter(root, buffer);
  descendingSorter = createBitonicSorter(root, buffer, {
    compare: (a, b) => {
      'use gpu';
      return a > b;
    },
    paddingValue: 0,
  });
}

function generateRandomArray() {
  const workgroupsTotal = Math.ceil(state.arraySize / WORKGROUP_SIZE);
  const [workgroupsX, workgroupsY, workgroupsZ] = decomposeWorkgroups(
    workgroupsTotal,
  );

  initLength.write(state.arraySize);
  initSeed.write(Math.random() * 1000);

  initPipeline
    .with(initBindGroup)
    .dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);

  render();
}

function render() {
  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(bindGroup)
    .draw(3);
}

const overlay = document.getElementById('sort-overlay') as HTMLDivElement;
const spinnerEl = document.getElementById('sort-spinner') as HTMLDivElement;
const statusEl = document.getElementById('sort-status') as HTMLSpanElement;
canvas.parentElement?.appendChild(overlay);

function showOverlay(text: string, showSpinner = true) {
  spinnerEl.hidden = !showSpinner;
  statusEl.textContent = text;
  overlay.hidden = false;
  overlay.classList.add('visible');
}

function hideOverlay(delayMs = 1500) {
  setTimeout(() => {
    overlay.classList.remove('visible');
    overlay.addEventListener('transitionend', () => (overlay.hidden = true), {
      once: true,
    });
  }, delayMs);
}

async function sort() {
  const sorter = state.sortOrder === 'descending'
    ? descendingSorter
    : ascendingSorter;

  showOverlay('Sorting...');
  sorter.run({ querySet: querySet ?? undefined });

  let gpuTimeMs: number | null = null;
  if (querySet?.available) {
    querySet.resolve();
    const timestamps = await querySet.read();
    gpuTimeMs = Number(timestamps[1] - timestamps[0]) / 1_000_000;
  }

  render();

  const timeStr = gpuTimeMs !== null
    ? ` in ${
      gpuTimeMs >= 1000
        ? `${(gpuTimeMs / 1000).toFixed(2)}s`
        : `${gpuTimeMs.toFixed(2)}ms`
    }`
    : '';
  showOverlay(`\u2714 Sorted${timeStr}`, false);
  hideOverlay();
}

// #region Example controls & Cleanup

type SortOrderKey = 'ascending' | 'descending';

export const controls = {
  'Array Size': {
    initial: arraySizeOptions[0],
    options: arraySizeOptions,
    onSelectChange: (value: number) => {
      state.arraySize = value;
      recreateBuffer();
      generateRandomArray();
    },
  },
  'Sort Order': {
    initial: 'ascending',
    options: ['ascending', 'descending'] as const,
    onSelectChange: (value: SortOrderKey) => {
      state.sortOrder = value;
    },
  },
  Reshuffle: { onButtonClick: generateRandomArray },
  Sort: { onButtonClick: sort },
};

export function onCleanup() {
  ascendingSorter.destroy();
  descendingSorter.destroy();
  root.destroy();
}

// #endregion

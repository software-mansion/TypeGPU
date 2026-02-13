import tgpu, { d, std } from 'typegpu';
import {
  type BitonicSorter,
  type BitonicSorterOptions,
  createBitonicSorter,
} from '@typegpu/sort';
import { randf } from '@typegpu/noise';
import { fullScreenTriangle } from 'typegpu/common';
import { decomposeWorkgroups } from './decomposeWorkgroups.ts';
import { defineControls } from '../../common/defineControls.ts';

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

type SortOrderKey =
  | 'ascending'
  | 'descending'
  | 'bit-reversed'
  | 'xor-scatter';

const sortOrders: Record<SortOrderKey, BitonicSorterOptions> = {
  ascending: {},
  descending: {
    compare: (a, b) => {
      'use gpu';
      return a > b;
    },
    paddingValue: 0,
  },
  'bit-reversed': {
    compare: (a, b) => {
      'use gpu';
      return std.reverseBits(a) < std.reverseBits(b);
    },
  },
  'xor-scatter': {
    compare: (a, b) => {
      'use gpu';
      return (a ^ 0xaa) < (b ^ 0xaa);
    },
  },
};

const state = {
  arraySize: arraySizeOptions[2],
  sortOrder: 'ascending' as SortOrderKey,
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
  const arrayLength = initLength.$;

  const cols = d.u32(std.round(std.sqrt(d.f32(arrayLength))));
  const rows = d.u32(std.round(arrayLength / cols));

  const col = d.u32(std.floor(input.uv.x * d.f32(cols)));
  const row = d.u32(std.floor(input.uv.y * d.f32(rows)));
  const idx = row * cols + col;

  if (idx >= arrayLength) {
    return d.vec4f(0.1, 0.1, 0.1, 1);
  }

  const value = renderLayout.$.data[idx];
  const normalized = value / 255;

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

function createSorters(buf: typeof buffer) {
  return Object.fromEntries(
    Object.entries(sortOrders).map(([key, opts]) => [
      key,
      createBitonicSorter(root, buf, opts),
    ]),
  ) as Record<SortOrderKey, BitonicSorter>;
}

let sorters = createSorters(buffer);

function recreateBuffer() {
  for (const s of Object.values(sorters)) {
    s.destroy();
  }
  buffer.destroy();

  buffer = root.createBuffer(d.arrayOf(d.u32, state.arraySize))
    .$usage('storage');

  bindGroup = root.createBindGroup(renderLayout, {
    data: buffer,
  });

  initBindGroup = root.createBindGroup(initLayout, {
    data: buffer,
  });

  sorters = createSorters(buffer);
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
  const sorter = sorters[state.sortOrder];

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

const sortOrderKeys = Object.keys(sortOrders) as SortOrderKey[];

export const controls = defineControls({
  'Array Size': {
    initial: arraySizeOptions[2],
    options: arraySizeOptions,
    onSelectChange: (value) => {
      state.arraySize = isNaN(value) ? 64 : value;
      recreateBuffer();
      generateRandomArray();
    },
  },
  'Sort Order': {
    initial: 'ascending',
    options: sortOrderKeys,
    onSelectChange: (value) => {
      state.sortOrder = value;
    },
  },
  Reshuffle: { onButtonClick: generateRandomArray },
  Sort: { onButtonClick: sort },
});

export function onCleanup() {
  for (const s of Object.values(sorters)) {
    s.destroy();
  }
  root.destroy();
}

// #endregion

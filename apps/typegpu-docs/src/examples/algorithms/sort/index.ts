import { tgpu, d, std, type TgpuQuerySet } from 'typegpu';
import {
  type BitonicSorter,
  type BitonicSorterOptions,
  createBitonicSorter,
  createRadixSorter,
  decomposeWorkgroups,
  type RadixSorter,
} from '@typegpu/sort';
import { randf } from '@typegpu/noise';
import { fullScreenTriangle } from 'typegpu/common';
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
const querySet = root.enabledFeatures.has('timestamp-query')
  ? root.createQuerySet('timestamp', 2)
  : null;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const maxSide = Math.floor(Math.sqrt(maxBufferSize / 4));
const minLog = 2;
const maxLog = Math.floor(Math.log2(maxSide));
const arraySizeOptions = Array.from({ length: 8 }, (_, i) => {
  const side = Math.round(2 ** (minLog + (i * (maxLog - minLog)) / 7));
  return side * side;
});

type AlgorithmKey = 'bitonic' | 'radix';
type SortOrderKey = 'ascending' | 'descending' | 'bit-reversed' | 'xor-scatter';

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
  algorithm: 'bitonic' as AlgorithmKey,
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

const initSeed = root.createUniform(d.f32, 0);

const fragmentFn = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const data = renderLayout.$.data;
  const arrayLength = data.length;

  const cols = d.u32(std.round(std.sqrt(d.f32(arrayLength))));
  const rows = d.u32(std.round(arrayLength / cols));

  const col = d.u32(std.floor(input.uv.x * d.f32(cols)));
  const row = d.u32(std.floor(input.uv.y * d.f32(rows)));
  const idx = row * cols + col;

  if (idx >= arrayLength) {
    return d.vec4f(0.1, 0.1, 0.1, 1);
  }

  const value = data[idx];
  const normalized = value / 255;

  return d.vec4f(normalized, normalized, normalized, 1);
});

const initKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const spanX = input.numWorkgroups.x * WORKGROUP_SIZE;
  const spanY = input.numWorkgroups.y * spanX;
  const idx = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  if (idx >= initLayout.$.data.length) {
    return;
  }

  randf.seed3(d.vec3f(d.f32(idx & 0xffff), d.f32(idx >> 16), initSeed.$));
  const n = randf.sample();
  initLayout.$.data[idx] = d.u32(std.floor(n * 256.0));
});

const renderPipeline = root.createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: fragmentFn,
  targets: { format: presentationFormat },
});

const initPipeline = root.createComputePipeline({ compute: initKernel });

let buffer = root.createBuffer(d.arrayOf(d.u32, state.arraySize)).$usage('storage');

let bindGroup = root.createBindGroup(renderLayout, { data: buffer });

function createBitonicSorters(buf: typeof buffer) {
  return Object.fromEntries(
    Object.entries(sortOrders).map(([key, opts]) => [key, createBitonicSorter(root, buf, opts)]),
  ) as Record<SortOrderKey, BitonicSorter>;
}

function createRadixSorters(buf: typeof buffer) {
  return {
    ascending: createRadixSorter(root, buf),
    descending: createRadixSorter(root, buf, { direction: 'descending' }),
  };
}

let bitonicSorters = createBitonicSorters(buffer);
let radixSorters = createRadixSorters(buffer);

function destroySorters() {
  for (const s of Object.values(bitonicSorters)) {
    s.destroy();
  }
  for (const s of Object.values(radixSorters)) {
    s.destroy();
  }
}

function recreateBuffer() {
  destroySorters();
  buffer.destroy();

  buffer = root.createBuffer(d.arrayOf(d.u32, state.arraySize)).$usage('storage');
  bindGroup = root.createBindGroup(renderLayout, { data: buffer });

  bitonicSorters = createBitonicSorters(buffer);
  radixSorters = createRadixSorters(buffer);
}

function fillRandom(buf: typeof buffer, size: number) {
  const workgroupsTotal = Math.ceil(size / WORKGROUP_SIZE);
  const [workgroupsX, workgroupsY, workgroupsZ] = decomposeWorkgroups(workgroupsTotal);

  initSeed.write(Math.random());
  initPipeline
    .with(root.createBindGroup(initLayout, { data: buf }))
    .dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);
}

function generateRandomArray() {
  fillRandom(buffer, state.arraySize);
  render();
}

function render() {
  renderPipeline.withColorAttachment({ view: context }).with(bindGroup).draw(3);
}

const overlay = document.getElementById('sort-overlay') as HTMLDivElement;
const spinnerEl = document.getElementById('sort-spinner') as HTMLDivElement;
const statusEl = document.getElementById('sort-status') as HTMLSpanElement;
canvas.parentElement?.appendChild(overlay);

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

function hideOverlay(delayMs = 1500) {
  hideTimeoutId = setTimeout(() => {
    hideTimeoutId = null;
    overlay.classList.remove('visible');
    overlay.addEventListener('transitionend', () => (overlay.hidden = true), {
      once: true,
    });
  }, delayMs);
}

function pickSorter(): { sorter: BitonicSorter | RadixSorter; note: string } {
  if (state.algorithm === 'radix') {
    if (state.sortOrder === 'ascending' || state.sortOrder === 'descending') {
      return { sorter: radixSorters[state.sortOrder], note: '' };
    }
    return {
      sorter: bitonicSorters[state.sortOrder],
      note: ' (custom orders need the bitonic sorter)',
    };
  }
  return { sorter: bitonicSorters[state.sortOrder], note: '' };
}

async function runSorterTimed(sorter: BitonicSorter | RadixSorter): Promise<number | null> {
  if (!querySet?.available) {
    sorter.run();
    return null;
  }

  const encoder = root.device.createCommandEncoder();
  const pass = encoder.beginComputePass({
    timestampWrites: {
      querySet: querySet.querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    },
  });
  sorter.run({ pass });
  pass.end();
  root.device.queue.submit([encoder.finish()]);

  querySet.resolve();
  const [start, end] = await querySet.read();
  return Number(end - start) / 1_000_000;
}

async function sort() {
  const { sorter, note } = pickSorter();

  showOverlay('Sorting...');
  const gpuTimeMs = await runSorterTimed(sorter);

  render();

  const timeStr = gpuTimeMs !== null ? ` in ${formatMs(gpuTimeMs)}` : '';
  showOverlay(`✔ Sorted${timeStr}${note}`, false);
  hideOverlay();
}

// #region Benchmark

const BENCH_WARMUP = 3;
const BENCH_RUNS = 10;

function formatMs(milliseconds: number): string {
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)}s`
    : `${milliseconds.toFixed(2)}ms`;
}

async function benchmarkSorter(
  sorter: BitonicSorter | RadixSorter,
  timestamps: TgpuQuerySet<'timestamp'>,
): Promise<number> {
  for (let i = 0; i < BENCH_WARMUP; i++) {
    sorter.run();
  }
  await root.device.queue.onSubmittedWorkDone();

  let total = 0;
  for (let i = 0; i < BENCH_RUNS; i++) {
    const encoder = root.device.createCommandEncoder();
    const pass = encoder.beginComputePass({
      timestampWrites: {
        querySet: timestamps.querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    });
    sorter.run({ pass });
    pass.end();
    root.device.queue.submit([encoder.finish()]);

    timestamps.resolve();
    const [start, end] = await timestamps.read();
    total += Number(end - start) / 1_000_000;
  }
  return total / BENCH_RUNS;
}

async function runBenchmark() {
  if (!querySet) {
    showOverlay('Benchmark requires timestamp-query', false);
    hideOverlay();
    return;
  }

  const sizes = [2 ** 12, 2 ** 16, 2 ** 20, 2 ** 22, 2 ** 24].filter(
    (size) => size * 4 <= maxBufferSize,
  );

  console.log(`=== Sort benchmark (avg GPU time, ${BENCH_RUNS} runs) ===`);
  for (const size of sizes) {
    showOverlay(`Benchmarking ${size.toLocaleString()} keys...`);

    const benchBuffer = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
    fillRandom(benchBuffer, size);

    const bitonic = createBitonicSorter(root, benchBuffer);
    const bitonicMs = await benchmarkSorter(bitonic, querySet);
    bitonic.destroy();

    fillRandom(benchBuffer, size);
    const radix = createRadixSorter(root, benchBuffer);
    const radixMs = await benchmarkSorter(radix, querySet);
    radix.destroy();

    benchBuffer.destroy();

    console.log(
      `  ${size.toLocaleString().padStart(12)} keys: bitonic ${formatMs(bitonicMs)}, radix ${formatMs(radixMs)}`,
    );
  }
  console.log('===============================================');

  showOverlay('✔ Benchmark complete (see console)', false);
  hideOverlay(3000);
}

// #endregion

// #region Example controls & Cleanup

const algorithmKeys: AlgorithmKey[] = ['bitonic', 'radix'];
const sortOrderKeys = Object.keys(sortOrders) as SortOrderKey[];

export const controls = defineControls({
  Algorithm: {
    initial: 'bitonic' as AlgorithmKey,
    options: algorithmKeys,
    onSelectChange: (value) => {
      state.algorithm = value;
    },
  },
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
    initial: 'ascending' as SortOrderKey,
    options: sortOrderKeys,
    onSelectChange: (value) => {
      state.sortOrder = value;
    },
  },
  Reshuffle: { onButtonClick: generateRandomArray },
  Sort: { onButtonClick: sort },
  Benchmark: { onButtonClick: runBenchmark },
});

export function onCleanup() {
  destroySorters();
  querySet?.destroy();
  root.destroy();
}

// #endregion

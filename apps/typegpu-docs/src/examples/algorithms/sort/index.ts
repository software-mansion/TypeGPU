import { tgpu, d, std, type TgpuQuerySet } from 'typegpu';
import {
  createBitonicSorter,
  createRadixSorter,
  decomposeWorkgroups,
  type RadixSorterOptions,
  type Sorter,
  sortKey,
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

const sortOrders: Record<SortOrderKey, RadixSorterOptions<d.U32>> = {
  ascending: { range: [0, 0xff] },
  descending: { range: [0, 0xff], direction: 'descending' },
  'bit-reversed': { key: std.reverseBits },
  'xor-scatter': {
    key: (v) => {
      'use gpu';
      return v ^ 0xaa;
    },
    keyBits: 8,
  },
};

const state: {
  algorithm: AlgorithmKey;
  arraySize: number;
  sortOrder: SortOrderKey;
} = {
  algorithm: 'bitonic',
  arraySize: arraySizeOptions[2],
  sortOrder: 'ascending',
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

  randf.seed3(d.vec3f(d.f32(idx & 0xffff), d.f32(idx >>> 16), initSeed.$));
  const n = randf.sample();
  initLayout.$.data[idx] = d.u32(std.floor(n * 256));
});

const renderPipeline = root.createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: fragmentFn,
  targets: { format: presentationFormat },
});

const initPipeline = root.createComputePipeline({ compute: initKernel });

let buffer = root.createBuffer(d.arrayOf(d.u32, state.arraySize)).$usage('storage');

let bindGroup = root.createBindGroup(renderLayout, { data: buffer });

function createSorter(): Sorter {
  const options = sortOrders[state.sortOrder];
  if (state.algorithm === 'radix') {
    return createRadixSorter(root, buffer, options);
  }
  const key = sortKey(d.u32, options);
  return createBitonicSorter(root, buffer, {
    compare: (a, b) => {
      'use gpu';
      return key(a) < key(b);
    },
  });
}

let sorter = createSorter();

function recreateSorter() {
  sorter.destroy();
  sorter = createSorter();
}

function recreateBuffer() {
  sorter.destroy();
  buffer.destroy();
  buffer = root.createBuffer(d.arrayOf(d.u32, state.arraySize)).$usage('storage');
  bindGroup = root.createBindGroup(renderLayout, { data: buffer });
  sorter = createSorter();
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

function formatMs(milliseconds: number): string {
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)}s`
    : `${milliseconds.toFixed(2)}ms`;
}

async function timedRun(sorter: Sorter, timestamps: TgpuQuerySet<'timestamp'>): Promise<number> {
  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginComputePass({
    timestampWrites: {
      querySet: timestamps,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    },
  });
  sorter.run({ pass });
  pass.end();
  encoder.submit();

  timestamps.resolve();
  const [start, end] = await timestamps.read();
  return Number(end - start) / 1_000_000;
}

async function sort() {
  if (benchmarking) {
    return;
  }
  showOverlay('Sorting...');
  let timeStr = '';
  if (querySet?.available) {
    timeStr = ` in ${formatMs(await timedRun(sorter, querySet))}`;
  } else {
    sorter.run();
  }

  render();
  showOverlay(`✔ Sorted${timeStr}`, false);
  hideOverlay();
}

// #region Benchmark

const BENCH_WARMUP = 3;
const BENCH_RUNS = 10;

async function benchmarkSorter(
  plan: Sorter,
  input: typeof buffer,
  work: typeof buffer,
  timestamps: TgpuQuerySet<'timestamp'>,
): Promise<string> {
  await plan.initAsync();
  for (let i = 0; i < BENCH_WARMUP; i++) {
    work.copyFrom(input);
    plan.run();
  }
  await root.device.queue.onSubmittedWorkDone();

  const times: number[] = [];
  for (let i = 0; i < BENCH_RUNS; i++) {
    work.copyFrom(input);
    times.push(await timedRun(plan, timestamps));
  }
  times.sort((a, b) => a - b);
  const median = (times[BENCH_RUNS / 2 - 1] + times[BENCH_RUNS / 2]) / 2;
  return `${formatMs(median)} (${formatMs(times[0])}–${formatMs(times[BENCH_RUNS - 1])})`;
}

let benchmarking = false;

async function runBenchmark() {
  if (benchmarking) {
    return;
  }
  if (!querySet?.available) {
    showOverlay('GPU timing unavailable', false);
    hideOverlay();
    return;
  }
  benchmarking = true;

  const sizes = [2 ** 12, 2 ** 16, 2 ** 20, 2 ** 22, 2 ** 24].filter(
    (size) => size * 4 <= maxBufferSize,
  );

  try {
    console.log(`=== Sort benchmark (median GPU time, min–max, ${BENCH_RUNS} runs) ===`);
    for (const size of sizes) {
      for (const keyBits of [32, 8]) {
        showOverlay(`Benchmarking ${size.toLocaleString()} ${keyBits}-bit keys...`);
        let seed = 123456789;
        const mask = 2 ** keyBits - 1;
        const data = Uint32Array.from({ length: size }, () => {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          return (seed & mask) >>> 0;
        });
        const input = root.createBuffer(d.arrayOf(d.u32, size), data).$usage('storage');
        const work = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
        const bitonic = createBitonicSorter(root, work);
        const radix = createRadixSorter(root, work, { keyBits });
        try {
          const bitonicTime = await benchmarkSorter(bitonic, input, work, querySet);
          const radixTime = await benchmarkSorter(radix, input, work, querySet);
          console.log(
            `${size.toLocaleString()} ${keyBits}-bit keys: bitonic ${bitonicTime}, radix ${radixTime}`,
          );
        } finally {
          bitonic.destroy();
          radix.destroy();
          work.destroy();
          input.destroy();
        }
      }
    }
    showOverlay('✔ Benchmark complete (see console)', false);
    hideOverlay(3000);
  } finally {
    benchmarking = false;
  }
}

// #endregion

// #region Example controls & Cleanup

const algorithmKeys: AlgorithmKey[] = ['bitonic', 'radix'];
const sortOrderKeys = Object.keys(sortOrders) as SortOrderKey[];

export const controls = defineControls({
  Algorithm: {
    initial: 'bitonic',
    options: algorithmKeys,
    onSelectChange: (value) => {
      state.algorithm = value;
      recreateSorter();
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
    initial: 'ascending',
    options: sortOrderKeys,
    onSelectChange: (value) => {
      state.sortOrder = value;
      recreateSorter();
    },
  },
  Reshuffle: { onButtonClick: generateRandomArray },
  Sort: { onButtonClick: sort },
  Benchmark: { onButtonClick: runBenchmark },
});

export function onCleanup() {
  sorter.destroy();
  querySet?.destroy();
  root.destroy();
}

// #endregion

import tgpu, { d, std } from 'typegpu';
import { type BitonicSorter, createBitonicSorter } from '@typegpu/sort';
import { fullScreenTriangle } from 'typegpu/common';

const root = await tgpu.init({
  device: { optionalFeatures: ['timestamp-query'] },
});
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');
const querySet = hasTimestampQuery ? root.createQuerySet('timestamp', 2) : null;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const state = {
  arraySize: 1000 as number,
  sortOrder: 'ascending' as 'ascending' | 'descending',
  inputArray: [] as number[],
};

const renderLayout = tgpu.bindGroupLayout({
  data: {
    storage: d.arrayOf(d.u32),
    access: 'readonly',
  },
});

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

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(fragmentFn, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-strip' })
  .createPipeline();

let buffer = root
  .createBuffer(d.arrayOf(d.u32, state.arraySize))
  .$usage('storage');

let bindGroup = root.createBindGroup(renderLayout, {
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

  buffer = root
    .createBuffer(d.arrayOf(d.u32, state.arraySize))
    .$usage('storage');

  bindGroup = root.createBindGroup(renderLayout, {
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
  state.inputArray = Array.from(
    { length: state.arraySize },
    () => Math.floor(Math.random() * 255),
  );
  buffer.write(state.inputArray);
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

async function sort() {
  const isDescending = state.sortOrder === 'descending';
  const sorter = isDescending ? descendingSorter : ascendingSorter;

  sorter.run({ querySet: querySet ?? undefined });

  let gpuTimeMs: number | null = null;
  if (querySet?.available) {
    querySet.resolve();
    const timestamps = await querySet.read();
    gpuTimeMs = Number(timestamps[1] - timestamps[0]) / 1_000_000;
  }

  render();

  const paddedInfo = sorter.wasPadded
    ? ` (padded to ${sorter.paddedSize})`
    : '';
  const timeInfo = gpuTimeMs !== null ? `${gpuTimeMs.toFixed(3)}ms` : 'N/A';
  console.log(
    `Sorted ${sorter.originalSize} elements${paddedInfo} - GPU time: ${timeInfo}`,
  );

  const sorted = await buffer.read();
  const isSorted = sorted.every((val, i, arr) => {
    if (i === 0) {
      return true;
    }
    return isDescending ? arr[i - 1] >= val : arr[i - 1] <= val;
  });
  if (!isSorted) {
    console.error('Sort verification failed!');
    console.log('Result:', sorted);
  }
}

generateRandomArray();

// #region Example controls & Cleanup

type SortOrderKey = 'ascending' | 'descending';

export const controls = {
  'Array Size': {
    initial: 64,
    min: 4,
    max: 2 ** 20,
    step: 1,
    onSliderChange: (value: number) => {
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
  Reshuffle: { onButtonClick: () => generateRandomArray() },
  Sort: { onButtonClick: () => sort() },
};

export function onCleanup() {
  ascendingSorter.destroy();
  descendingSorter.destroy();
  root.destroy();
}

// #endregion

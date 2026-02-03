import tgpu, { d, std } from 'typegpu';
import { bitonicSort } from '@typegpu/sort';

const ARRAY_SIZES = {
  '63': 63,
  '64': 64,
  '65': 65,
  '100': 100,
  '256': 256,
  '1000': 1000,
  '1024': 1024,
  '4096': 4096,
  '16384': 16384,
  '65536': 65536,
} as const;

type ArraySizeKey = keyof typeof ARRAY_SIZES;

const SORT_ORDERS = {
  Ascending: 'ascending',
  Descending: 'descending',
} as const;

type SortOrderKey = keyof typeof SORT_ORDERS;

// Descending comparison function (a > b means a comes before b)
const descendingCompare = tgpu.fn([d.u32, d.u32], d.bool)((a, b) => a > b);

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');
const querySet = hasTimestampQuery ? root.createQuerySet('timestamp', 2) : null;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;

const context = root.configureContext({
  canvas,
  alphaMode: 'premultiplied',
});
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const state = {
  arraySize: 1000 as number,
  sortOrder: 'ascending' as 'ascending' | 'descending',
  inputArray: [] as number[],
};

// Bind group layout for visualization
const renderLayout = tgpu.bindGroupLayout({
  data: {
    storage: (n: number) => d.arrayOf(d.u32, n),
    access: 'readonly',
  },
  params: {
    uniform: d.struct({
      arrayLength: d.u32,
      maxValue: d.u32,
    }),
  },
});

// Fullscreen triangle vertex shader
const vertexFn = tgpu['~unstable'].vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  // Fullscreen triangle that covers [-1, 1] in NDC
  const x = std.select(-1, 3, input.idx === 1);
  const y = std.select(-1, 3, input.idx === 2);

  // UV coords: [0,1] range
  const u = d.f32(x + 1) / 2;
  const v = d.f32(1 - y) / 2; // Flip Y so top is 0

  return {
    pos: d.vec4f(d.f32(x), d.f32(y), 0, 1),
    uv: d.vec2f(u, v),
  };
});

// Fragment shader - render array as grayscale grid
const fragmentFn = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const arrayLength = renderLayout.$.params.arrayLength;
  const maxValue = renderLayout.$.params.maxValue;

  // Calculate grid dimensions (try to make it roughly square)
  const cols = d.u32(std.ceil(std.sqrt(d.f32(arrayLength))));
  const rows = d.u32(std.ceil(d.f32(arrayLength) / d.f32(cols)));

  // Calculate which cell we're in
  const col = d.u32(std.floor(input.uv.x * d.f32(cols)));
  const row = d.u32(std.floor(input.uv.y * d.f32(rows)));
  const idx = row * cols + col;

  // Out of bounds check
  if (idx >= arrayLength) {
    return d.vec4f(0.1, 0.1, 0.1, 1);
  }

  // Get value and normalize to [0, 1]
  const value = renderLayout.$.data[idx];
  const normalized = d.f32(value) / d.f32(maxValue);

  // Render as grayscale
  return d.vec4f(normalized, normalized, normalized, 1);
});

// Create render pipeline
const renderPipeline = root['~unstable']
  .withVertex(vertexFn, {})
  .withFragment(fragmentFn, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-strip' })
  .createPipeline();

// Create buffers
let buffer = root
  .createBuffer(d.arrayOf(d.u32, state.arraySize))
  .$usage('storage');

const paramsBuffer = root
  .createBuffer(
    d.struct({
      arrayLength: d.u32,
      maxValue: d.u32,
    }),
  )
  .$usage('uniform');

let bindGroup = root.createBindGroup(renderLayout, {
  data: buffer,
  params: paramsBuffer,
});

function recreateBuffer() {
  buffer.destroy();
  buffer = root
    .createBuffer(d.arrayOf(d.u32, state.arraySize))
    .$usage('storage');

  bindGroup = root.createBindGroup(renderLayout, {
    data: buffer,
    params: paramsBuffer,
  });
}

function generateRandomArray() {
  state.inputArray = Array.from(
    { length: state.arraySize },
    () => Math.floor(Math.random() * 1000),
  );
  buffer.write(state.inputArray);
  paramsBuffer.write({
    arrayLength: state.arraySize,
    maxValue: 1000,
  });
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
  // Configure sort options based on state
  const isDescending = state.sortOrder === 'descending';
  const result = bitonicSort(root, buffer, {
    compare: isDescending ? descendingCompare : undefined,
    paddingValue: isDescending ? 0 : 0xffffffff,
    querySet: querySet ?? undefined,
  });

  // Get GPU timing if available
  let gpuTimeMs: number | null = null;
  if (querySet?.available) {
    querySet.resolve();
    const timestamps = await querySet.read();
    gpuTimeMs = Number(timestamps[1] - timestamps[0]) / 1_000_000;
  }

  render();

  const paddedInfo = result.wasPadded
    ? ` (padded to ${result.paddedSize})`
    : '';
  const timeInfo = gpuTimeMs !== null ? `${gpuTimeMs.toFixed(3)}ms` : 'N/A';
  console.log(
    `Sorted ${result.originalSize} elements${paddedInfo} - GPU time: ${timeInfo}`,
  );

  // Verify sort is correct
  const sorted = await buffer.read();
  const isSorted = sorted.every((val, i, arr) => {
    if (i === 0) return true;
    return isDescending ? arr[i - 1] >= val : arr[i - 1] <= val;
  });
  if (!isSorted) {
    console.error('Sort verification failed!');
    console.log('Result:', sorted);
  }
}

// Initialize
generateRandomArray();

// #region Example controls & Cleanup

export const controls = {
  'Array Size': {
    initial: '1000',
    options: Object.keys(ARRAY_SIZES),
    onSelectChange: (value: ArraySizeKey) => {
      state.arraySize = ARRAY_SIZES[value];
      recreateBuffer();
      generateRandomArray();
    },
  },
  'Sort Order': {
    initial: 'Ascending',
    options: Object.keys(SORT_ORDERS),
    onSelectChange: (value: SortOrderKey) => {
      state.sortOrder = SORT_ORDERS[value];
    },
  },
  Reshuffle: { onButtonClick: () => generateRandomArray() },
  Sort: { onButtonClick: () => sort() },
};

export function onCleanup() {
  buffer.destroy();
  paramsBuffer.destroy();
  querySet?.destroy();
  root.destroy();
}

// #endregion

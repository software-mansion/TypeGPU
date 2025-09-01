import tgpu, { type StorageFlag, type TgpuBuffer } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const SIZE = 28;

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query', 'subgroups'],
  },
});
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');
const hasSubgroups = root.enabledFeatures.has('subgroups');
let useSubgroups = hasSubgroups;

const canvasData = new Array<number>(SIZE ** 2).fill(0);

const ReadonlyFloats = {
  storage: (n: number) => d.arrayOf(d.f32, n),
  access: 'readonly',
} as const;

const MutableFloats = {
  storage: (n: number) => d.arrayOf(d.f32, n),
  access: 'mutable',
} as const;

const ioLayout = tgpu.bindGroupLayout({
  input: ReadonlyFloats,
  output: MutableFloats,
});

const weightsBiasesLayout = tgpu.bindGroupLayout({
  weights: ReadonlyFloats,
  biases: ReadonlyFloats,
});

// Shaders

const relu = tgpu.fn([d.f32], d.f32)((x) => std.max(0, x));

const defaultCompute = tgpu['~unstable'].computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [1],
})(({ gid }) => {
  const inputSize = ioLayout.$.input.length;

  const i = gid.x;
  const weightsOffset = i * inputSize;
  let sum = d.f32();

  for (let j = d.u32(); j < inputSize; j++) {
    sum = std.fma(
      ioLayout.$.input[j],
      weightsBiasesLayout.$.weights[weightsOffset + j],
      sum,
    );
  }

  const total = sum + weightsBiasesLayout.$.biases[i];
  ioLayout.$.output[i] = relu(total);
});

const workgroupSize = tgpu['~unstable'].const(d.u32, 128);
const subgroupCompute = tgpu['~unstable'].computeFn({
  in: {
    lid: d.builtin.localInvocationId,
    wid: d.builtin.workgroupId,
    sid: d.builtin.subgroupInvocationId,
    ssize: d.builtin.subgroupSize,
  },
  workgroupSize: [128],
})(({ lid, wid, sid, ssize }) => {
  const subgroupId = d.u32(lid.x / ssize);
  const outputsPerWG = d.u32(workgroupSize.$ / ssize);
  const neuronIndex = wid.x * outputsPerWG + subgroupId;

  const outLen = ioLayout.$.output.length;
  const valid = neuronIndex < outLen;

  const inputSize = ioLayout.$.input.length;

  let partial = d.f32();

  if (valid) {
    const weightsOffset = neuronIndex * inputSize;
    for (let j = sid; j < inputSize; j += ssize) {
      partial = std.fma(
        ioLayout.$.input[j],
        weightsBiasesLayout.$.weights[weightsOffset + j],
        partial,
      );
    }
  }

  const sum = std.subgroupAdd(partial);

  if (valid && sid === 0) {
    ioLayout.$.output[neuronIndex] = relu(
      sum + weightsBiasesLayout.$.biases[neuronIndex],
    );
  }
});

const pipelines = {
  default: root['~unstable'].withCompute(defaultCompute).createPipeline(),
  subgroup: root.enabledFeatures.has('subgroups')
    ? root['~unstable'].withCompute(subgroupCompute).createPipeline()
    : null,
};

// Definitions for the network

interface LayerData {
  shape: readonly [number] | readonly [number, number];
  buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
}

interface Layer {
  weights: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  biases: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  state: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
}

interface Network {
  layers: Layer[];
  input: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  output: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;

  inference(data: number[]): Promise<number[]>;
}

const querySet = hasTimestampQuery ? root.createQuerySet('timestamp', 2) : null;

/**
 * Creates a network from a list of pairs of weights and biases
 *
 * It automates the creation of state buffers that are used to store the intermediate results of the network
 * as well as the input layer buffer
 *
 * It provides an inference function that takes an array of input data and returns an array of output data
 */
function createNetwork(layers: [LayerData, LayerData][]): Network {
  const buffers = layers.map(([weights, biases]) => {
    if (weights.shape[1] !== biases.shape[0]) {
      throw new Error(`Shape mismatch: ${weights.shape} and ${biases.shape}`);
    }

    return {
      weights: weights.buffer,
      biases: biases.buffer,
      state: root
        .createBuffer(d.arrayOf(d.f32, biases.shape[0]))
        .$usage('storage'),
    };
  });

  const input = root
    .createBuffer(d.arrayOf(d.f32, layers[0][0].shape[0]))
    .$usage('storage');
  const output = buffers[buffers.length - 1].state;

  const ioBindGroups = buffers.map((_, i) =>
    root.createBindGroup(ioLayout, {
      input: i === 0 ? input : buffers[i - 1].state,
      output: buffers[i].state,
    })
  );

  const weightsBindGroups = buffers.map((layer) =>
    root.createBindGroup(weightsBiasesLayout, {
      weights: layer.weights,
      biases: layer.biases,
    })
  );

  async function inference(data: number[]): Promise<number[]> {
    // verify the length of the data matches the input layer
    if (data.length !== layers[0][0].shape[0]) {
      throw new Error(
        `Data length ${data.length} does not match input shape ${
          layers[0][0].shape[0]
        }`,
      );
    }
    input.write(data);

    const pipeline = useSubgroups && pipelines.subgroup
      ? pipelines.subgroup
      : pipelines.default;

    // Run the network
    for (let i = 0; i < buffers.length; i++) {
      const isFirstLayer = i === 0;
      const isLastLayer = i === buffers.length - 1;

      let boundPipeline = pipeline
        .with(ioLayout, ioBindGroups[i])
        .with(weightsBiasesLayout, weightsBindGroups[i]);

      if (querySet && (isFirstLayer || isLastLayer)) {
        const descriptor = {
          querySet,
          beginningOfPassWriteIndex: isFirstLayer ? 0 : undefined,
          endOfPassWriteIndex: isLastLayer ? 1 : undefined,
        };
        boundPipeline = boundPipeline.withTimestampWrites(descriptor);
      }

      boundPipeline.dispatchWorkgroups(
        buffers[i].biases.dataType.elementCount,
      );
    }

    if (querySet?.available) {
      querySet.resolve();
      const results = await querySet.read();
      const inferenceTimeMs = Number(results[1] - results[0]) / 1_000_000;

      inferenceTimeEl.textContent = `${inferenceTimeMs.toFixed(2)} ms`;
    } else {
      inferenceTimeEl.textContent = 'N/A';
    }

    // Read the output
    return await output.read();
  }

  return {
    layers: buffers,
    input,
    output,
    inference,
  };
}

const network = createNetwork(await downloadLayers());

// #region Downloading weights & biases

/**
 * Create a LayerData object from a layer ArrayBuffer
 *
 * The function extracts the header, shape and data from the layer
 * If there are any issues with the layer, an error is thrown
 *
 * Automatically creates appropriate buffer initialized with the data
 */
function getLayerData(layer: ArrayBuffer): LayerData {
  const headerLen = new Uint16Array(layer.slice(8, 10));

  const header = new TextDecoder().decode(
    new Uint8Array(layer.slice(10, 10 + headerLen[0])),
  );

  // shape can be found in the header in the format: 'shape': (x, y) or 'shape': (x,) for bias
  const shapeMatch = header.match(/'shape': \((\d+), ?(\d+)?\)/);
  if (!shapeMatch) {
    throw new Error('Shape not found in header');
  }

  // To accommodate .npy weirdness - if we have a 2d shape we need to switch the order
  const X = Number.parseInt(shapeMatch[1]);
  const Y = Number.parseInt(shapeMatch[2]);
  const shape = Number.isNaN(Y) ? ([X] as const) : ([Y, X] as const);

  const data = new Float32Array(layer.slice(10 + headerLen[0]));

  // Verify the length of the data matches the shape
  if (data.length !== shape[0] * (shape[1] || 1)) {
    throw new Error(`Data length ${data.length} does not match shape ${shape}`);
  }

  const buffer = root
    .createBuffer(d.arrayOf(d.f32, data.length), [...data])
    .$usage('storage');

  return {
    shape,
    buffer,
  };
}

function downloadLayers(): Promise<[LayerData, LayerData][]> {
  const downloadLayer = async (fileName: string): Promise<LayerData> => {
    const buffer = await fetch(
      `/TypeGPU/assets/mnist-weights/${fileName}`,
    ).then((res) => res.arrayBuffer());

    return getLayerData(buffer);
  };

  return Promise.all(
    [0, 1, 2, 3, 4, 5, 6, 7].map((layer) =>
      Promise.all([
        downloadLayer(`layer${layer}.weight.npy`),
        downloadLayer(`layer${layer}.bias.npy`),
      ])
    ),
  );
}

// #endregion

// #region Example controls and cleanup

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('2d') as CanvasRenderingContext2D;

const bars = Array.from(document.querySelectorAll('.bar')) as HTMLDivElement[];
const subgroupsEl = document.getElementById(
  'subgroups-status',
) as HTMLSpanElement;
const inferenceTimeEl = document.getElementById(
  'inference-time',
) as HTMLSpanElement;

const uiState = {
  isDrawing: false,
  lastPos: null as { x: number; y: number } | null,
  isBlank: true,
};

function resetDrawing() {
  uiState.lastPos = null;
  canvasData.fill(0);
  uiState.isBlank = true;

  for (const bar of bars) {
    bar.style.setProperty('--bar-width', '0');
  }
}

let disposed = false;

function run() {
  if (disposed) {
    return;
  }

  const scale = canvas.width / SIZE;

  context.clearRect(0, 0, canvas.width, canvas.height);

  // draw grid
  context.strokeStyle = '#ccc';
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      context.strokeRect(j * scale, i * scale, scale, scale);
    }
  }

  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const value = canvasData[i * SIZE + j];
      if (value > 0) {
        const inverted = 255 - value;
        context.fillStyle = `rgb(${inverted}, ${inverted}, ${inverted})`;
        context.fillRect(j * scale, i * scale, scale, scale);
      }
    }
  }

  if (uiState.isBlank) {
    context.font = '40px Aeonik';
    context.textAlign = 'center';
    context.fillStyle = '#000';
    context.fillText('draw here 🖌️', canvas.width / 2, canvas.height / 2);
  }
  requestAnimationFrame(run);
}

document.querySelector('.loading')?.classList.add('loaded');

function updateSubgroupsStatus() {
  const text = !hasSubgroups
    ? 'Not Supported'
    : useSubgroups
    ? 'Enabled'
    : 'Disabled';
  const cls = !hasSubgroups || !useSubgroups ? 'disabled' : 'enabled';
  subgroupsEl.textContent = text;
  subgroupsEl.className = cls;
}

updateSubgroupsStatus();

run();

canvas.addEventListener('mousedown', () => {
  uiState.isDrawing = true;
});

const mouseUpEventListener = () => {
  uiState.isDrawing = false;
  uiState.lastPos = null;
};
window.addEventListener('mouseup', mouseUpEventListener);

const touchEndEventListener = () => {
  uiState.lastPos = null;
};
window.addEventListener('touchend', touchEndEventListener);

function centerImage(data: number[]) {
  const mass = data.reduce((acc, value) => acc + value, 0);
  const x = data.reduce((acc, value, i) => acc + value * (i % SIZE), 0) / mass;
  const y =
    data.reduce((acc, value, i) => acc + value * Math.floor(i / SIZE), 0) /
    mass;

  const offsetX = Math.round(SIZE / 2 - x);
  const offsetY = Math.round(SIZE / 2 - y);

  const newData = new Array(SIZE * SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const index = i * SIZE + j;
      const newIndex = (i + offsetY) * SIZE + j + offsetX;
      if (newIndex >= 0 && newIndex < SIZE * SIZE) {
        newData[newIndex] = data[index];
      }
    }
  }

  return newData;
}

async function handleDrawing(x: number, y: number): Promise<void> {
  if (!uiState.lastPos) {
    uiState.lastPos = { x, y };
  }

  uiState.isBlank = false;

  if (x === uiState.lastPos.x && y === uiState.lastPos.y) {
    return;
  }

  const interpolate = (start: number, end: number, steps: number) => {
    const step = (end - start) / steps;
    return Array.from({ length: steps + 1 }, (_, i) => start + step * i);
  };

  const steps = Math.max(
    Math.abs(x - uiState.lastPos.x),
    Math.abs(y - uiState.lastPos.y),
  );
  const xPoints = interpolate(uiState.lastPos.x, x, steps);
  const yPoints = interpolate(uiState.lastPos.y, y, steps);

  for (let k = 0; k < xPoints.length; k++) {
    const newX = Math.round(xPoints[k]);
    const newY = Math.round(yPoints[k]);

    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const adjX = newX + i;
        const adjY = newY + j;
        if (adjX >= 0 && adjX < SIZE && adjY >= 0 && adjY < SIZE) {
          const distance = Math.abs(i) + Math.abs(j);
          const add = distance === 0 ? 128 : distance === 1 ? 32 : 16;
          const value = canvasData[adjY * SIZE + adjX];
          canvasData[adjY * SIZE + adjX] = Math.min(value + add, 255);
        }
      }
    }
  }

  uiState.lastPos = { x, y };

  const certainties = await network.inference(
    // scale the values from [0, 255] to [-0.42, 2.82]
    centerImage(canvasData).map((x) => (x / 255) * 3.24 - 0.42),
  );

  const max = Math.max(...certainties);
  const index = certainties.indexOf(max);
  const sum = certainties.reduce((a, b) => a + b, 0);
  const normalized = certainties.map((x) => x / sum);

  bars.forEach((bar, i) => {
    bar.style.setProperty('--bar-width', `${normalized[i]}`);
    bar.style.setProperty('--highlight-opacity', i === index ? '1' : '0');
  });
}

canvas.addEventListener('mousemove', (event) => {
  if (!uiState.isDrawing) {
    return;
  }
  const cellSize = canvas.width / SIZE;
  const x = Math.floor((event.offsetX * window.devicePixelRatio) / cellSize);
  const y = Math.floor((event.offsetY * window.devicePixelRatio) / cellSize);
  handleDrawing(x, y);
});

canvas.addEventListener('touchmove', (event) => {
  event.preventDefault();
  const canvasPos = canvas.getBoundingClientRect();
  const touch = event.touches[0];
  const cellSize = canvas.width / SIZE;
  const x = Math.floor(
    ((touch.clientX - canvasPos.left) * window.devicePixelRatio) / cellSize,
  );
  const y = Math.floor(
    ((touch.clientY - canvasPos.top) * window.devicePixelRatio) / cellSize,
  );
  handleDrawing(x, y);
}, { passive: false });

export const controls = {
  Reset: {
    onButtonClick: resetDrawing,
  },
  'Use Subgroups': hasSubgroups && {
    initial: hasSubgroups,
    onToggleChange: (value: boolean) => {
      useSubgroups = value;
      updateSubgroupsStatus();
    },
  },
  'Test Resolution': {
    onButtonClick: () =>
      [defaultCompute, subgroupCompute]
        .map((fn) =>
          tgpu.resolve({
            externals: { fn },
            enableExtensions: ['subgroups'],
          })
        )
        .map((r) => root.device.createShaderModule({ code: r })),
  },
};

export function onCleanup() {
  disposed = true;
  window.removeEventListener('mouseup', mouseUpEventListener);
  window.removeEventListener('touchend', touchEndEventListener);
  root.destroy();
}

// #endregion

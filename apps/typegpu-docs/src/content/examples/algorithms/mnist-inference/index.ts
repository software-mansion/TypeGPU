import tgpu, { type TgpuBuffer, type Storage } from 'typegpu';
import { type F32, type TgpuArray, arrayOf, f32 } from 'typegpu/data';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const SIZE = 28;

const root = await tgpu.init();
const device = root.device;
const canvasData = new Array<number>(SIZE ** 2);

// Shader code

const layerShader = `
  @binding(0) @group(0) var<storage, read> input: array<f32>;
  @binding(1) @group(0) var<storage, read_write> output: array<f32>;

  @binding(0) @group(1) var<storage, read> weights: array<f32>;
  @binding(1) @group(1) var<storage, read> biases: array<f32>;

  fn relu(x: f32) -> f32 {
    return max(0.0, x);
  }

  @compute @workgroup_size(1)
  fn main(@builtin(global_invocation_id) gid: vec3u) {
    let inputSize = arrayLength( &input );

    let i = gid.x;

    let weightsOffset = i * inputSize;
    var sum = 0.0;

    for (var j = 0u; j < inputSize; j = j + 1) {
      sum = sum + input[j] * weights[weightsOffset + j];
    }

    sum = sum + biases[i];
    output[i] = relu(sum);
  }
`;

const inputOutput = tgpu.bindGroupLayout({
  input: {
    storage: (n) => arrayOf(f32, n),
    access: 'readonly',
  },
  output: {
    storage: (n) => arrayOf(f32, n),
    access: 'mutable',
  },
});

const weightsBiases = tgpu.bindGroupLayout({
  weights: {
    storage: (n) => arrayOf(f32, n),
    access: 'readonly',
  },
  biases: {
    storage: (n) => arrayOf(f32, n),
    access: 'readonly',
  },
});

const pipelineLayout = device.createPipelineLayout({
  bindGroupLayouts: [root.unwrap(inputOutput), root.unwrap(weightsBiases)],
});

const pipeline = device.createComputePipeline({
  layout: pipelineLayout,
  compute: {
    module: device.createShaderModule({
      code: layerShader,
    }),
  },
});

// Definitions for the network

interface LayerData {
  header: string;
  data: Float32Array;
  shape: [number, number?];
  buffer: TgpuBuffer<TgpuArray<F32>> & Storage;
}

interface Layer {
  weights: LayerData;
  biases: LayerData;
  buffers: {
    weights: TgpuBuffer<TgpuArray<F32>> & Storage;
    biases: TgpuBuffer<TgpuArray<F32>> & Storage;
    state: TgpuBuffer<TgpuArray<F32>> & Storage;
  };
}

interface Network {
  layers: Layer[];
  input: TgpuBuffer<TgpuArray<F32>> & Storage;
  output: TgpuBuffer<TgpuArray<F32>> & Storage;

  inference(data: number[]): Promise<number[]>;
}

// Network loading functions

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

  // To accomodate .npy weirdness - if we have a 2d shape we need to switch the order
  const shape = Number.isNaN(Number.parseInt(shapeMatch[2]))
    ? ([Number.parseInt(shapeMatch[1])] as [number, number?])
    : ([Number.parseInt(shapeMatch[2]), Number.parseInt(shapeMatch[1])] as [
        number,
        number?,
      ]);

  const data = new Float32Array(layer.slice(10 + headerLen[0]));
  // verify the length of the data matches the shape
  if (data.length !== shape[0] * (shape[1] || 1)) {
    throw new Error(`Data length ${data.length} does not match shape ${shape}`);
  }
  const buffer = root
    .createBuffer(arrayOf(f32, data.length), [...data])
    .$usage('storage');

  return {
    header,
    data,
    shape,
    buffer,
  };
}

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
      weights: weights,
      biases: biases,
      buffers: {
        weights: weights.buffer,
        biases: biases.buffer,
        state: root
          .createBuffer(arrayOf(f32, biases.shape[0]))
          .$usage('storage'),
      },
    };
  });

  const input = root
    .createBuffer(arrayOf(f32, layers[0][0].shape[0]))
    .$usage('storage');
  const output = buffers[buffers.length - 1].buffers.state;

  const ioBindGroups = buffers.map((_, i) =>
    root.unwrap(
      inputOutput.populate({
        input: i === 0 ? input : buffers[i - 1].buffers.state,
        output: buffers[i].buffers.state,
      }),
    ),
  );

  const weightsBindGroups = buffers.map((layer) =>
    root.unwrap(
      weightsBiases.populate({
        weights: layer.buffers.weights,
        biases: layer.buffers.biases,
      }),
    ),
  );

  async function inference(data: number[]): Promise<number[]> {
    // verify the length of the data matches the input layer
    if (data.length !== layers[0][0].shape[0]) {
      throw new Error(
        `Data length ${data.length} does not match input shape ${layers[0][0].shape[0]}`,
      );
    }
    input.write(data);

    // Run the network
    const encoder = device.createCommandEncoder();
    for (let i = 0; i < buffers.length; i++) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, ioBindGroups[i]);
      pass.setBindGroup(1, weightsBindGroups[i]);
      pass.dispatchWorkgroups(buffers[i].biases.shape[0]);
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();

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

// Data fetching and network creation

const layerData: [LayerData, LayerData][] = await Promise.all(
  [0, 1, 2, 3, 4, 5, 6, 7].map(
    (layer) =>
      Promise.all(
        [`layer${layer}.weight.npy`, `layer${layer}.bias.npy`].map((fileName) =>
          fetch(`/TypeGPU/mnistWeightsExperimental/${fileName}`).then((res) =>
            res.arrayBuffer().then((buffer) => getLayerData(buffer)),
          ),
        ),
      ) as Promise<[LayerData, LayerData]>,
  ),
);

const network = createNetwork(layerData);

// Canvas drawing

const context = canvas.getContext('2d') as CanvasRenderingContext2D;

const bars = document.querySelectorAll('.bar') as NodeListOf<HTMLDivElement>;

const resetAll = () => {
  canvasData.fill(0);
  resetCanvas();
  for (const bar of bars) {
    bar.style.setProperty('--bar-width', '0');
  }
};

const resetCanvas = () => {
  context.clearRect(0, 0, canvas.width, canvas.height);
  // draw grid
  context.strokeStyle = '#ccc';
  const scale = canvas.width / SIZE;
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      context.strokeRect(j * scale, i * scale, scale, scale);
    }
  }
};

const draw = () => {
  const scale = canvas.width / SIZE;
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const value = canvasData[i * SIZE + j];
      if (value > 0) {
        context.fillStyle = `rgb(${255 - value}, ${255 - value}, ${255 - value})`;
        context.fillRect(j * scale, i * scale, scale, scale);
      }
    }
  }
};

const observer = new ResizeObserver(() => {
  resetCanvas();
  draw();
});
observer.observe(canvas.parentNode?.parentNode as HTMLElement);

let isDrawing = false;
canvas.addEventListener('mousedown', () => {
  isDrawing = true;
});

canvas.addEventListener('mouseup', () => {
  isDrawing = false;
});

function centerImage(data: number[]) {
  const x =
    data.reduce((acc, value, i) => acc + value * (i % SIZE), 0) /
    data.reduce((acc, value) => acc + value, 0);
  const y =
    data.reduce((acc, value, i) => acc + value * Math.floor(i / SIZE), 0) /
    data.reduce((acc, value) => acc + value, 0);

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

let lastPos = { x: 0, y: 0 };

const handleDrawing = (x: number, y: number) => {
  if (x === lastPos.x && y === lastPos.y) {
    return;
  }
  lastPos = { x, y };

  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const newX = x + i;
      const newY = y + j;
      if (newX >= 0 && newX < SIZE && newY >= 0 && newY < SIZE) {
        const distance = Math.abs(i) + Math.abs(j);
        const add = distance === 0 ? 128 : distance === 1 ? 64 : 32;
        const value = canvasData[newY * SIZE + newX];
        canvasData[newY * SIZE + newX] = Math.min(value + add, 255);
      }
    }
  }
  draw();

  network
    .inference(centerImage(canvasData).map((x) => (x / 255) * 3.24 - 0.42)) // scale the values from 0-255 to -0.42-2.82
    .then((data) => {
      const max = Math.max(...data);
      const index = data.indexOf(max);
      const sum = data.reduce((a, b) => a + b, 0);
      const normalized = data.map((x) => x / sum);

      bars.forEach((bar, i) => {
        bar.style.setProperty('--bar-width', `${normalized[i] * 100}%`);
        bar.style.setProperty('--highlight-opacity', i === index ? '1' : '0');
      });
    });
};

canvas.addEventListener('mousemove', (event) => {
  if (!isDrawing) {
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
});

resetAll();

/** @button "Reset" */
export function reset() {
  resetAll();
}

/*
{
  "title": "Mnist Inference",
  "category": "algorithms",
  "tags": ["experimental"]
}
*/

import { type F32, type TgpuArray, arrayOf, f32 } from 'typegpu/data';
import tgpu, { type TgpuBuffer } from 'typegpu/experimental';

if (!navigator.gpu) {
  throw new Error('WebGPU is not supported by this browser.');
}
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('Could not find a compatible GPU.');
}
const device = await adapter.requestDevice();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const root = await tgpu.init({
  device,
});
const data = new Uint8Array(28 * 28);

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
    storage: (length: number) => {
      return arrayOf(f32, length);
    },
    access: 'readonly',
  },
  output: {
    storage: (length: number) => {
      return arrayOf(f32, length);
    },
    access: 'mutable',
  },
});

const weightsBiases = tgpu.bindGroupLayout({
  weights: {
    storage: (length: number) => {
      return arrayOf(f32, length);
    },
    access: 'readonly',
  },
  biases: {
    storage: (length: number) => {
      return arrayOf(f32, length);
    },
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

// Inference function

async function inferNetwork(network: Network) {
  let encoder = device.createCommandEncoder();

  // First layer (input -> layer1)
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    root.unwrap(
      inputOutput.populate({
        input: network.input,
        output: network.layers[0].buffers.state,
      }),
    ),
  );
  pass.setBindGroup(
    1,
    root.unwrap(
      weightsBiases.populate({
        weights: network.layers[0].buffers.weights,
        biases: network.layers[0].buffers.biases,
      }),
    ),
  );
  pass.dispatchWorkgroups(network.layers[0].biases.shape[0]);
  pass.end();
  device.queue.submit([encoder.finish()]);

  // All other layers (layer1 -> layerN -> output)
  for (let i = 1; i < network.layers.length; i++) {
    encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      root.unwrap(
        inputOutput.populate({
          input: network.layers[i - 1].buffers.state,
          output: network.layers[i].buffers.state,
        }),
      ),
    );
    pass.setBindGroup(
      1,
      root.unwrap(
        weightsBiases.populate({
          weights: network.layers[i].buffers.weights,
          biases: network.layers[i].buffers.biases,
        }),
      ),
    );
    pass.dispatchWorkgroups(network.layers[i].biases.shape[0]);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  await device.queue.onSubmittedWorkDone();
}

// Definitions for the network

interface LayerData {
  header: string;
  data: Float32Array;
  shape: [number, number?];
  buffer: TgpuBuffer<TgpuArray<F32>> & typeof tgpu.Storage;
}

interface Layer {
  weights: LayerData;
  biases: LayerData;
  buffers: {
    weights: TgpuBuffer<TgpuArray<F32>> & typeof tgpu.Storage;
    biases: TgpuBuffer<TgpuArray<F32>> & typeof tgpu.Storage;
    state: TgpuBuffer<TgpuArray<F32>> & typeof tgpu.Storage;
  };
}

interface Network {
  layers: Layer[];
  input: TgpuBuffer<TgpuArray<F32>> & typeof tgpu.Storage;
  output: TgpuBuffer<TgpuArray<F32>> & typeof tgpu.Storage;

  inference(data: number[]): Promise<number[]>;
}

// Network loading functions

/*
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
  console.log('Header: ', header);
  console.log('Shape match: ', shapeMatch);
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
  console.log('Shape: ', shape);

  const data = new Float32Array(layer.slice(10 + headerLen[0]));
  // verify the length of the data matches the shape
  if (data.length !== shape[0] * (shape[1] || 1)) {
    throw new Error(`Data length ${data.length} does not match shape ${shape}`);
  }
  const buffer = root
    .createBuffer(arrayOf(f32, data.length), [...data])
    .$usage(tgpu.Storage);

  return {
    header,
    data,
    shape,
    buffer,
  };
}

/*
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
      throw new Error('Shape mismatch');
    }

    return {
      weights: weights,
      biases: biases,
      buffers: {
        weights: weights.buffer,
        biases: biases.buffer,
        state: root
          .createBuffer(arrayOf(f32, biases.shape[0]))
          .$usage(tgpu.Storage),
      },
    };
  });

  const input = root
    .createBuffer(arrayOf(f32, layers[0][0].shape[0]))
    .$usage(tgpu.Storage);
  const output = buffers[buffers.length - 1].buffers.state;

  return {
    layers: buffers,
    input,
    output,

    async inference(data: number[]) {
      if (data.length !== layers[0][0].shape[0]) {
        throw new Error(
          `Data length ${data.length} does not match input shape ${layers[0][0].shape[0]}`,
        );
      }
      input.write(data);
      await inferNetwork(this);
      return await output.read();
    },
  };
}

// Data fetching and network creation

const layer0Biases = await fetch('/TypeGPU/mnistWeights/layer0.bias.npy').then(
  (res) => res.arrayBuffer().then((buffer) => getLayerData(buffer)),
);
const layer0Weights = await fetch(
  '/TypeGPU/mnistWeights/layer0.weight.npy',
).then((res) => res.arrayBuffer().then((buffer) => getLayerData(buffer)));

const layer1Biases = await fetch('/TypeGPU/mnistWeights/layer1.bias.npy').then(
  (res) => res.arrayBuffer().then((buffer) => getLayerData(buffer)),
);
const layer1Weights = await fetch(
  '/TypeGPU/mnistWeights/layer1.weight.npy',
).then((res) => res.arrayBuffer().then((buffer) => getLayerData(buffer)));

const layer2Biases = await fetch('/TypeGPU/mnistWeights/layer2.bias.npy').then(
  (res) => res.arrayBuffer().then((buffer) => getLayerData(buffer)),
);
const layer2Weights = await fetch(
  '/TypeGPU/mnistWeights/layer2.weight.npy',
).then((res) => res.arrayBuffer().then((buffer) => getLayerData(buffer)));

const network = createNetwork([
  [layer0Weights, layer0Biases],
  [layer1Weights, layer1Biases],
  [layer2Weights, layer2Biases],
]);

// Canvas drawing

const context = canvas.getContext('2d') as CanvasRenderingContext2D;
const parent = canvas.parentElement as HTMLElement;

interface BarDisplay {
  set value(value: number);
  readonly classList: DOMTokenList;
}

const predictionsContainer = document.createElement('div');
parent.parentElement?.parentElement?.appendChild(predictionsContainer);
predictionsContainer.classList.add(
  'flex',
  'flex-col',
  'aspect-square',
  'w-full',
  'items-center',
  'p-2',
);

const predictionsLabel = document.createElement('div');
predictionsLabel.textContent = 'Predictions:';
predictionsLabel.classList.add('font-bold', 'mb-2', 'text-xl');
predictionsContainer.appendChild(predictionsLabel);

const barsContainer = document.createElement('div');
predictionsContainer.appendChild(barsContainer);
barsContainer.classList.add(
  'flex',
  'flex-col',
  'w-full',
  'justify-start',
  'pr-10',
);

const createBar = (index: number): BarDisplay => {
  const container = document.createElement('div');
  container.classList.add('flex', 'items-baseline', 'mb-1', 'w-full');

  const label = document.createElement('div');
  label.textContent = `${index}`;
  label.classList.add('w-1/6', 'text-center', 'font-bold');
  container.appendChild(label);

  const bar = document.createElement('div');
  bar.classList.add('w-5/6', 'h-4', 'bg-gray-100', 'rounded-full');
  container.appendChild(bar);

  const fill = document.createElement('div');
  fill.classList.add(
    'h-full',
    'bg-gray-300',
    'rounded-full',
    'overflow-hidden',
    'transition-all',
    'relative',
  );
  fill.classList.add(
    'before:content-[""]',
    'before:bg-gradient-to-r',
    'before:from-gradient-purple-dark',
    'before:to-gradient-blue-dark',
    'before:absolute',
    'before:inset-0',
    'before:rounded-full',
    'before:transition-all',
    'before:opacity-0',
  );
  bar.appendChild(fill);

  barsContainer.appendChild(container);

  return {
    set value(value: number) {
      fill.style.width = `${value * 100}%`;
    },
    get classList() {
      return fill.classList;
    },
  };
};

const bars: BarDisplay[] = Array.from({ length: 10 }, (_, i) => createBar(i));

const resetAll = () => {
  data.fill(0);
  resetCanvas();
};

const resetCanvas = () => {
  context.clearRect(0, 0, canvas.width, canvas.height);
  // draw grid
  context.strokeStyle = '#ccc';
  const scale = canvas.width / 28;
  for (let i = 0; i < 28; i++) {
    for (let j = 0; j < 28; j++) {
      context.strokeRect(j * scale, i * scale, scale, scale);
    }
  }
};
resetCanvas();

const draw = () => {
  const size = 28;
  const scale = canvas.width / size;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const value = data[i * size + j];
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
observer.observe(canvas);

let isDrawing = false;
canvas.addEventListener('mousedown', () => {
  isDrawing = true;
});

canvas.addEventListener('mouseup', () => {
  isDrawing = false;
});

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
      if (newX >= 0 && newX < 28 && newY >= 0 && newY < 28) {
        const distance = Math.abs(i) + Math.abs(j);
        const add = distance === 0 ? 128 : distance === 1 ? 64 : 32;
        const value = data[newY * 28 + newX];
        data[newY * 28 + newX] = Math.min(value + add, 255);
      }
    }
  }
  draw();

  network.inference([...data].map((x) => x / 255)).then((data) => {
    const max = Math.max(...data);
    const index = data.indexOf(max);
    const sum = data.reduce((a, b) => a + b, 0);
    const normalized = data.map((x) => x / sum);

    bars.forEach((bar, i) => {
      bar.value = normalized[i];
      if (i === index) {
        bar.classList.add('before:opacity-100');
      } else {
        bar.classList.remove('before:opacity-100');
      }
    });
  });
};

canvas.addEventListener('mousemove', (event) => {
  if (!isDrawing) {
    return;
  }
  const cellSize = canvas.width / 28;
  const x = Math.floor((event.offsetX * window.devicePixelRatio) / cellSize);
  const y = Math.floor((event.offsetY * window.devicePixelRatio) / cellSize);
  handleDrawing(x, y);
});

canvas.addEventListener('touchmove', (event) => {
  event.preventDefault();
  const canvasPos = canvas.getBoundingClientRect();
  const touch = event.touches[0];
  const cellSize = canvas.width / 28;
  const x = Math.floor(
    ((touch.clientX - canvasPos.left) * window.devicePixelRatio) / cellSize,
  );
  const y = Math.floor(
    ((touch.clientY - canvasPos.top) * window.devicePixelRatio) / cellSize,
  );
  handleDrawing(x, y);
});

/** @button "Reset" */
export function reset() {
  resetAll();
}

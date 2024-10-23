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

const context = canvas.getContext('2d') as CanvasRenderingContext2D;
const parent = canvas.parentElement?.parentElement as HTMLElement;
const result = document.createElement('div');
parent.appendChild(result);

const data = new Uint8Array(28 * 28);

const root = await tgpu.init({
  device,
});

interface LayerData {
  header: string;
  data: Float32Array;
  shape: [number, number?];
  buffer: TgpuBuffer<TgpuArray<F32>> & typeof tgpu.Storage;
}

function getLayerData(layer: ArrayBuffer, shape: [number, number?]): LayerData {
  const headerLen = new Uint16Array(layer.slice(8, 10));

  const header = new TextDecoder().decode(
    new Uint8Array(layer.slice(10, 10 + headerLen[0])),
  );

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

const layer0Biases = await fetch('/TypeGPU/mnistWeights/layer0.bias.npy').then(
  (res) => res.arrayBuffer().then((buffer) => getLayerData(buffer, [256])),
);
const layer0Weights = await fetch(
  '/TypeGPU/mnistWeights/layer0.weight.npy',
).then((res) =>
  res.arrayBuffer().then((buffer) => getLayerData(buffer, [784, 256])),
);
const layer1Biases = await fetch('/TypeGPU/mnistWeights/layer1.bias.npy').then(
  (res) => res.arrayBuffer().then((buffer) => getLayerData(buffer, [128])),
);
const layer1Weights = await fetch(
  '/TypeGPU/mnistWeights/layer1.weight.npy',
).then((res) =>
  res.arrayBuffer().then((buffer) => getLayerData(buffer, [256, 128])),
);
const layer2Biases = await fetch('/TypeGPU/mnistWeights/layer2.bias.npy').then(
  (res) => res.arrayBuffer().then((buffer) => getLayerData(buffer, [10])),
);
const layer2Weights = await fetch(
  '/TypeGPU/mnistWeights/layer2.weight.npy',
).then((res) =>
  res.arrayBuffer().then((buffer) => getLayerData(buffer, [128, 10])),
);

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
  writeToInput(data: number[]): void;
}

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
    writeToInput(data: number[]) {
      input.write(data);
    },
  };
}

const network = createNetwork([
  [layer0Weights, layer0Biases],
  [layer1Weights, layer1Biases],
  [layer2Weights, layer2Biases],
]);

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

function inference(network: Network) {
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

  // Read the output
  const outputData =
    network.layers[network.layers.length - 1].buffers.state.read();
  outputData.then(async (data) => {
    const max = Math.max(...data);
    const index = data.indexOf(max);
    console.log('Predictions:');
    // display the predictions as percentages
    const sum = data.reduce((a, b) => a + b, 0);
    data.forEach((value, i) => {
      console.log(
        `${i}: ${((value / sum) * 100).toFixed(2)}% ${i === index ? '<--' : ''}`,
      );
    });
    result.textContent = `Prediction: ${index}`;
  });
}

const resetCanvas = () => {
  data.fill(0);
  context.clearRect(0, 0, canvas.width, canvas.height);
};
resetCanvas();

const draw = () => {
  const size = 28;
  const scale = canvas.width / size;
  context.clearRect(0, 0, canvas.width, canvas.height);
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

let isDrawing = false;
canvas.addEventListener('mousedown', () => {
  isDrawing = true;
});

canvas.addEventListener('mouseup', () => {
  isDrawing = false;
});

let lastPos = { x: 0, y: 0 };
canvas.addEventListener('mousemove', (event) => {
  if (!isDrawing) {
    return;
  }
  const cellSize = canvas.width / 28;
  const x = Math.floor((event.offsetX * window.devicePixelRatio) / cellSize);
  const y = Math.floor((event.offsetY * window.devicePixelRatio) / cellSize);

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
  // Blur the image for better predictions
  const blurred = new Uint8Array(data.length);
  for (let i = 0; i < 28; i++) {
    for (let j = 0; j < 28; j++) {
      let sum = 0;
      let count = 0;
      for (let k = -1; k <= 1; k++) {
        for (let l = -1; l <= 1; l++) {
          const x = j + k;
          const y = i + l;
          if (x >= 0 && x < 28 && y >= 0 && y < 28) {
            sum += data[y * 28 + x];
            count++;
          }
        }
      }
      blurred[i * 28 + j] = sum / count;
    }
  }
  network.writeToInput([...blurred].map((x) => x / 255));
  inference(network);
});

/** @button "Reset" */
export function reset() {
  resetCanvas();
}

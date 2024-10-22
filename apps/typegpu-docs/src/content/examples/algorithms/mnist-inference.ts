/*
{
  "title": "Mnist Inference",
  "category": "algorithms",
  "tags": ["experimental"]
}
*/

import { arrayOf, f32 } from 'typegpu/data';
import tgpu from 'typegpu/experimental';

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
const data = new Uint8Array(28 * 28);

const fillWhite = () => {
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
};
fillWhite();

const draw = () => {
  const size = 28;
  const scale = canvas.width / size;
  context.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas before drawing
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const value = data[i * size + j];
      if (value > 0) {
        // Only draw filled cells
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
  input.write([...data].map((value) => 1 - value / 255));
  inference();
});

const response = await fetch('/TypeGPU/model.json');
const model = await response.json();

const weights = model.weights.dense.weights.flat();
const biases = model.weights.dense.biases;
const weights2 = model.weights.dense_1.weights.flat();
console.log(weights2);
const biases2 = model.weights.dense_1.biases;

const root = await tgpu.init({
  device,
});

const input = root.createBuffer(arrayOf(f32, 784)).$usage(tgpu.Storage);
const layer1 = root.createBuffer(arrayOf(f32, 48)).$usage(tgpu.Storage);
const output = root.createBuffer(arrayOf(f32, 10)).$usage(tgpu.Storage);

const weightsBuffer = root
  .createBuffer(arrayOf(f32, 784 * 48), weights)
  .$usage(tgpu.Storage);
const biasesBuffer = root
  .createBuffer(arrayOf(f32, 48), biases)
  .$usage(tgpu.Storage);
const weights2Buffer = root
  .createBuffer(arrayOf(f32, 48 * 10), weights2)
  .$usage(tgpu.Storage);
const biases2Buffer = root
  .createBuffer(arrayOf(f32, 10), biases2)
  .$usage(tgpu.Storage);

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

const inference = () => {
  let encoder = device.createCommandEncoder();

  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    root.unwrap(inputOutput.populate({ input, output: layer1 })),
  );
  pass.setBindGroup(
    1,
    root.unwrap(
      weightsBiases.populate({ weights: weightsBuffer, biases: biasesBuffer }),
    ),
  );
  pass.dispatchWorkgroups(48);
  pass.end();
  device.queue.submit([encoder.finish()]);

  encoder = device.createCommandEncoder();
  const pass2 = encoder.beginComputePass();
  pass2.setPipeline(pipeline);
  pass2.setBindGroup(
    0,
    root.unwrap(inputOutput.populate({ input: layer1, output })),
  );
  pass2.setBindGroup(
    1,
    root.unwrap(
      weightsBiases.populate({
        weights: weights2Buffer,
        biases: biases2Buffer,
      }),
    ),
  );
  pass2.dispatchWorkgroups(10);
  pass2.end();
  device.queue.submit([encoder.finish()]);

  const outputData = output.read();
  outputData.then(async (data) => {
    const max = Math.max(...data);
    const index = data.indexOf(max);
    console.log('Data:', data);
    console.log('Prediction:', index);
  });
};

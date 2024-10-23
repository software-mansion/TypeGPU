/*
{
  "title": "NN Tests",
  "category": "algorithms",
  "tags": ["experimental"]
}
*/

// TODO: Remove this file before marking as ready for review

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
const root = await tgpu.init({
  device,
});

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

const testInputBuffer = root
  .createBuffer(arrayOf(f32, 10), [...Array(10).keys()])
  .$usage(tgpu.Storage);
const testOutputBuffer = root
  .createBuffer(arrayOf(f32, 10))
  .$usage(tgpu.Storage);

const testWeightsBuffer = root
  .createBuffer(
    arrayOf(f32, 100),
    Array.from({ length: 100 }, () => 1),
  )
  .$usage(tgpu.Storage);
const testBiasesBuffer = root
  .createBuffer(arrayOf(f32, 10), [...Array(10).keys()])
  .$usage(tgpu.Storage);

const inference = () => {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    root.unwrap(
      inputOutput.populate({
        input: testInputBuffer,
        output: testOutputBuffer,
      }),
    ),
  );
  pass.setBindGroup(
    1,
    root.unwrap(
      weightsBiases.populate({
        weights: testWeightsBuffer,
        biases: testBiasesBuffer,
      }),
    ),
  );
  pass.dispatchWorkgroups(10);
  pass.end();
  device.queue.submit([encoder.finish()]);

  testOutputBuffer.read().then((data) => {
    console.log(data);
  });
};

// EXPERIMENTS
// load 'layer0.bias.npy'
const layer0Bias = await fetch('/TypeGPU/mnistWeightsv2/layer0.bias.npy').then(
  (res) => res.arrayBuffer(),
);
const layer0Weights = await fetch(
  '/TypeGPU/mnistWeightsv2/layer0.weight.npy',
).then((res) => res.arrayBuffer());
// The first 6 bytes are a magic string: exactly \x93NUMPY.
// The next 1 byte is an unsigned byte: the major version number of the file format, e.g. \x01.
// The next 1 byte is an unsigned byte: the minor version number of the file format, e.g. \x00. Note: the version of the file format is not tied to the version of the numpy package.
// The next 2 bytes form a little-endian unsigned short int: the length of the header data HEADER_LEN.
// The next HEADER_LEN bytes form the header data describing the array’s format. It is an ASCII string which contains a Python literal expression of a dictionary. It is terminated by a newline (\n) and padded with spaces (\x20) to make the total of len(magic string) + 2 + len(length) + HEADER_LEN be evenly divisible by 64 for alignment purposes.

interface LayerData {
  header: string;
  data: Float32Array;
  length: number;
  shape: [number, number?];
}

function getLayerData(layer: ArrayBuffer): LayerData {
  const headerLen = new Uint16Array(layer.slice(8, 10));

  const header = new TextDecoder().decode(
    new Uint8Array(layer.slice(10, 10 + headerLen[0])),
  );

  // get shape from the header
  const shapeMatch = header.match(/'shape': \((\d+), (\d+)\)/);
  if (!shapeMatch) {
    throw new Error('Shape not found in header');
  }
  const shape = [
    Number.parseInt(shapeMatch[1]),
    Number.parseInt(shapeMatch[2]),
  ] as [number, number?];

  const data = new Float32Array(layer.slice(10 + headerLen[0]));
  // verify the length of the data matches the shape
  if (data.length !== shape[0] * (shape[1] || 1)) {
    throw new Error('Data length does not match the shape');
  }

  return {
    header,
    data,
    length: data.length,
    shape,
  };
}
console.log('Shape: ', getLayerData(layer0Weights).shape);

/** @button "Infer" */
export function infer() {
  inference();
}

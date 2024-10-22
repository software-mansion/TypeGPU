/*
{
  "title": "NN Tests",
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

/** @button "Randomize" */
export function infer() {
  inference();
}

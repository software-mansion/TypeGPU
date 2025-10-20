import * as ort from 'onnxruntime-web/webgpu';

export const MODEL_WIDTH = 320;
export const MODEL_HEIGHT = 320;

// AAA docs
export async function prepareSession(input: GPUBuffer, output: GPUBuffer) {
  // ort.env.webgpu.device = root.device; // see https://github.com/microsoft/onnxruntime/issues/26107

  const session = await ort.InferenceSession
    .create('/TypeGPU/assets/background-segmentation/silueta.onnx', {
      executionProviders: ['webgpu'],
      logVerbosityLevel: 3,
    });

  console.log(session);

  const myPreAllocatedInputTensor = ort.Tensor.fromGpuBuffer(input, {
    dataType: 'float32',
    dims: [1, 3, MODEL_HEIGHT, MODEL_WIDTH],
  });

  const myPreAllocatedOutputTensor = ort.Tensor.fromGpuBuffer(output, {
    dataType: 'float32',
    dims: [1, 1, MODEL_HEIGHT, MODEL_WIDTH],
  });

  const feeds = { 'input.1': myPreAllocatedInputTensor };
  const fetches = { '1960': myPreAllocatedOutputTensor };
  return () => session.run(feeds, fetches);
}

import * as ort from 'onnxruntime-web/webgpu';

export const MODEL_WIDTH = 256;
export const MODEL_HEIGHT = 256;

// AAA docs
export async function prepareSession(input: GPUBuffer, output: GPUBuffer) {
  // ort.env.webgpu.device = root.device; // see https://github.com/microsoft/onnxruntime/issues/26107

  const weightsRaw = await fetch(
    '/TypeGPU/assets/background-segmentation/model.data',
  );
  const weights = await weightsRaw.blob();

  const session = await ort.InferenceSession
    .create('/TypeGPU/assets/background-segmentation/model.onnx', {
      executionProviders: ['webgpu'],
      externalData: [{
        data: weights,
        path: 'model.data',
      }],
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

  const feeds = { 'image': myPreAllocatedInputTensor };
  const fetches = { 'mask': myPreAllocatedOutputTensor };
  return () => session.run(feeds, fetches);
}

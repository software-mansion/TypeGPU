import * as ort from 'onnxruntime-web/webgpu';

export const MODEL_WIDTH = 320;
export const MODEL_HEIGHT = 320;

/**
 * Prepares an ONNX Runtime inference session for calculating background segmentation mask using the u2netp model.
 *
 * @param input - GPU buffer containing the input image data (an array of length MODEL_WIDTH * MODEL_HEIGHT * 3, filled with red, green and blue images one after another)
 * @param output - GPU buffer that will receive the segmentation mask output (an array of length MODEL_WIDTH * MODEL_HEIGHT)
 *
 * @returns A session object with methods to run inference and release resources
 *
 * @see {@link https://github.com/microsoft/onnxruntime/issues/26107} - Related ONNX Runtime issue (the reason why we need to monkey patch the device instead of setting it in this function)
 *
 * @example
 * ```typescript
 * const { run, release } = await prepareSession(inputBuffer, outputBuffer);
 * await run();
 * release();
 * ```
 */
export async function prepareSession(input: GPUBuffer, output: GPUBuffer) {
  const session = await ort.InferenceSession
    .create('/TypeGPU/assets/background-segmentation/u2netp.onnx', {
      executionProviders: ['webgpu'],
    });

  const myPreAllocatedInputTensor = ort.Tensor.fromGpuBuffer(input, {
    dataType: 'float32',
    dims: [1, 3, MODEL_HEIGHT, MODEL_WIDTH],
  });

  const myPreAllocatedOutputTensor = ort.Tensor.fromGpuBuffer(output, {
    dataType: 'float32',
    dims: [1, 1, MODEL_HEIGHT, MODEL_WIDTH],
  });

  const feeds = { 'input.1': myPreAllocatedInputTensor };
  const fetches = { '1959': myPreAllocatedOutputTensor };
  return {
    run: () => session.run(feeds, fetches),
    release: () => session.release(),
  };
}

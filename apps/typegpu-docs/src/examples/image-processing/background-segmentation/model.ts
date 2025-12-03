import * as ort from 'onnxruntime-web/webgpu';

export const MODEL_WIDTH = 320;
export const MODEL_HEIGHT = 320;

export interface ModelConfig {
  name: string;
  path: string;
  inputName: string;
  outputName: string;
  externalData?: { data: string; path: string }[];
}

export const MODELS: ModelConfig[] = [
  {
    name: 'u2netp',
    path: '/TypeGPU/assets/background-segmentation/u2netp.onnx',
    inputName: 'input.1',
    outputName: '1964',
  },
  {
    name: 'mobile_light',
    path: '/TypeGPU/assets/background-segmentation/moblie_light_aug_200/model_178.onnx',
    inputName: 'input',
    outputName: 'output',
    externalData: [
      {
        data: '/TypeGPU/assets/background-segmentation/moblie_light_aug_200/model_178.onnx.data',
        path: 'model_178.onnx.data',
      },
    ],
  },
];

/**
 * Prepares an ONNX Runtime inference session for calculating background segmentation mask.
 *
 * @param input - GPU buffer containing the input image data (an array of length MODEL_WIDTH * MODEL_HEIGHT * 3, filled with red, green and blue images one after another)
 * @param output - GPU buffer that will receive the segmentation mask output (an array of length MODEL_WIDTH * MODEL_HEIGHT)
 * @param modelConfig - Configuration for the model to use
 *
 * @returns A session object with methods to run inference and release resources
 *
 * @see {@link https://github.com/microsoft/onnxruntime/issues/26107} - Related ONNX Runtime issue (the reason why we need to monkey patch the device instead of setting it in this function)
 *
 * @example
 * ```typescript
 * const { run, release } = await prepareSession(inputBuffer, outputBuffer, MODELS[0]);
 * await run();
 * release();
 * ```
 */
export async function prepareSession(
  input: GPUBuffer,
  output: GPUBuffer,
  modelConfig: ModelConfig = MODELS[0],
) {
  const session = await ort.InferenceSession.create(modelConfig.path, {
    executionProviders: ['webgpu'],
    graphOptimizationLevel: 'all',
    externalData: modelConfig.externalData,
  });

  const myPreAllocatedInputTensor = ort.Tensor.fromGpuBuffer(input, {
    dataType: 'float32',
    dims: [1, 3, MODEL_HEIGHT, MODEL_WIDTH],
  });

  const myPreAllocatedOutputTensor = ort.Tensor.fromGpuBuffer(output, {
    dataType: 'float32',
    dims: [1, 1, MODEL_HEIGHT, MODEL_WIDTH],
  });

  const feeds = { [modelConfig.inputName]: myPreAllocatedInputTensor };
  const fetches = { [modelConfig.outputName]: myPreAllocatedOutputTensor };

  return {
    run: () => session.run(feeds, fetches),
    release: () => session.release(),
  };
}

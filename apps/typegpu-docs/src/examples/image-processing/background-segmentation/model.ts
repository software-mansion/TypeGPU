import * as ort from 'onnxruntime-web/webgpu';
import type { ModelConfig } from './schemas.ts';

export const MODEL_WIDTH = 320;
export const MODEL_HEIGHT = 320;

const modelCache = new Map<string, ArrayBuffer>();

export const MODELS: ModelConfig[] = [
  {
    name: 'u2netp - [5mb]',
    path: '/TypeGPU/assets/background-segmentation/u2netp.onnx',
    inputName: 'input.1',
    outputName: '1964',
    description: 'Original u2netp model, U-Squared-net architecture',
  },
  {
    name: 'mobileV2 - [11mb]',
    path:
      'https://huggingface.co/lursz/bg-segm/resolve/main/mobileNetv2-lightAug/model_178.onnx',
    inputName: 'input',
    outputName: 'output',
    externalData: [
      {
        data:
          'https://huggingface.co/lursz/bg-segm/resolve/main/mobileNetv2-lightAug/model_178.onnx.data',
        path: 'model_178.onnx.data',
      },
    ],
    description:
      'MobileNetV2 based lightweight model, light augmentation, 200 epochs',
  },
  {
    name: 'mobileV4 - cutting [7mb]',
    path:
      'https://huggingface.co/lursz/bg-segm/resolve/main/mobileNetv4-cutAug/model_91.onnx',
    inputName: 'input',
    outputName: 'output',
    externalData: [
      {
        data:
          'https://huggingface.co/lursz/bg-segm/resolve/main/mobileNetv4-cutAug/model_91.onnx.data',
        path: 'model_91.onnx.data',
      },
    ],
    description:
      'MobileNetV4 based lightweight model, was fed only parts of pictures, 200 epochs',
  },
  {
    name: 'mobileV2 - anti-noise [11mb]',
    path:
      'https://huggingface.co/lursz/bg-segm/resolve/main/mobileNetv2-heavyAug/model_197.onnx',
    inputName: 'input',
    outputName: 'output',
    externalData: [
      {
        data:
          'https://huggingface.co/lursz/bg-segm/resolve/main/mobileNetv2-heavyAug/model_197.onnx.data',
        path: 'model_197.onnx.data',
      },
    ],
    description:
      'MobileNetV2 based lightweight model, endured heavy augmentation, lots of noise and distortion 200 epochs',
  },
  {
    name: 'autoencoder - [17mb]',
    path:
      'https://huggingface.co/lursz/bg-segm/resolve/main/autoencoder-heavyAug/model_37.onnx',
    inputName: 'input',
    outputName: 'output',
    externalData: [
      {
        data:
          'https://huggingface.co/lursz/bg-segm/resolve/main/autoencoder-heavyAug/model_37.onnx.data',
        path: 'model_37.onnx.data',
      },
    ],
    description:
      'Fully custom autoencoder model, no pretrained backbone, endured heavy augmentation, 200 epochs',
  },
];

async function fetchWithCache(url: string): Promise<ArrayBuffer> {
  const cached = modelCache.get(url);
  if (cached) {
    return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }

  const data = await response.arrayBuffer();
  modelCache.set(url, data);
  return data;
}

async function loadModelData(modelConfig: ModelConfig): Promise<{
  modelData: ArrayBuffer;
  externalData?: { data: ArrayBuffer; path: string }[];
}> {
  const modelPromise = fetchWithCache(modelConfig.path);

  const externalDataPromises = modelConfig.externalData?.map(async (ext) => ({
    data: await fetchWithCache(ext.data),
    path: ext.path,
  }));

  const [modelData, externalData] = await Promise.all([
    modelPromise,
    externalDataPromises ? Promise.all(externalDataPromises) : undefined,
  ]);

  return { modelData, externalData };
}

/**
 * Prepares an ONNX Runtime inference session for calculating background segmentation mask.
 * The model and its external data files are dynamically loaded and cached for future use.
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
  const { modelData, externalData } = await loadModelData(modelConfig);

  const session = await ort.InferenceSession.create(modelData, {
    executionProviders: ['webgpu'],
    graphOptimizationLevel: 'all',
    externalData,
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
    release: () => {
      void session.release();
      modelCache.clear();
    },
  };
}

import { Inference, OnnxLoader } from '@typegpu/ai';
import { type StorageFlag, type TgpuBuffer, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

export const MODEL_WIDTH = 320;
export const MODEL_HEIGHT = 320;

/**
 * Prepares a TypeGPU AI inference session for calculating background segmentation mask using the u2netp model.
 *
 * @param root - The TypeGPU root instance
 * @param input - GPU buffer containing the input image data (an array of length MODEL_WIDTH * MODEL_HEIGHT * 3, filled with red, green and blue images one after another)
 * @param output - GPU buffer that will receive the segmentation mask output (an array of length MODEL_WIDTH * MODEL_HEIGHT)
 *
 * @returns A session object with methods to run inference and release resources
 *
 * @example
 * ```typescript
 * const { run, release } = await prepareSession(root, inputBuffer, outputBuffer);
 * await run();
 * release();
 * ```
 */
export async function prepareSession(
  root: TgpuRoot,
  input: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
  output: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
) {
  const loader = await OnnxLoader.fromPath(
    '/TypeGPU/assets/background-segmentation/u2netp.onnx',
  );
  const inference = new Inference(root, loader.model);
  const network = inference.createNetwork();

  return {
    run: () => network.run(input, output),
    release: () => {},
  };
}

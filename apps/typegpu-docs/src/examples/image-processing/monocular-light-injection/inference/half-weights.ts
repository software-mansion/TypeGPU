import type { DepthBundle, DepthTensor } from './types.ts';
import { floatToHalf, tensorSectionBytes } from './winograd-f2-weight.ts';

const LANE_TILE = 16;

/**
 * Converts a plain FP32 O4/I4 convolution weight to FP16 so the dispatch can
 * take the native-FP16 kernel. The result is uploaded to its own buffer rather
 * than written back into the arena, because FP16 is half the size and would
 * break the section layout every other tensor is addressed against.
 *
 * With `transposeLanes` the output and input lane are swapped as the bytes are
 * written, which is what the outer-product 1x1 kernel reads. That is the same
 * permutation `transposeLanePairs` applies to the FP16 weights already in the
 * bundle, done here for free while the values are being rewritten anyway.
 */
export function convertWeightToHalf(
  bundle: DepthBundle,
  tensor: DepthTensor,
  transposeLanes: boolean,
): Uint8Array {
  const source = tensorSectionBytes(bundle, tensor, 'Convertible weight');
  const scalarCount = source.byteLength / Float32Array.BYTES_PER_ELEMENT;
  const reader = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const target = new Uint16Array(scalarCount);
  for (let base = 0; base < scalarCount; base += LANE_TILE) {
    for (let outputLane = 0; outputLane < 4; outputLane += 1) {
      for (let inputLane = 0; inputLane < 4; inputLane += 1) {
        const value = reader.getFloat32((base + outputLane * 4 + inputLane) * 4, true);
        const lane = transposeLanes ? inputLane * 4 + outputLane : outputLane * 4 + inputLane;
        target[base + lane] = floatToHalf(value);
      }
    }
  }
  return new Uint8Array(target.buffer);
}

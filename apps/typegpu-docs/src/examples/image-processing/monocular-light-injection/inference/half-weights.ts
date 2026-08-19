import type { DepthBundle, DepthTensor } from './types.ts';
import { floatToHalf, tensorSectionBytes } from './winograd-f2-weight.ts';

const LANE_TILE = 16;

/** Converts a plain FP32 O4/I4 convolution weight to FP16 for the native-FP16 kernel */
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

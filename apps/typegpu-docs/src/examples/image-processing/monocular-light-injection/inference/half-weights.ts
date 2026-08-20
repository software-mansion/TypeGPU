import type { DepthBundle, DepthTensor } from './types.ts';
import { tensorSectionBytes } from './winograd-weight.ts';

const LANE_TILE = 16;

export function convertWeightToHalf(
  bundle: DepthBundle,
  tensor: DepthTensor,
  transposeLanes: boolean,
): Uint8Array {
  const source = tensorSectionBytes(bundle, tensor);
  const scalarCount = source.byteLength / Float32Array.BYTES_PER_ELEMENT;
  const reader = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const target = new ArrayBuffer(scalarCount * 2);
  const writer = new DataView(target);
  for (let base = 0; base < scalarCount; base += LANE_TILE) {
    for (let outputLane = 0; outputLane < 4; outputLane += 1) {
      for (let inputLane = 0; inputLane < 4; inputLane += 1) {
        const value = reader.getFloat32((base + outputLane * 4 + inputLane) * 4, true);
        const lane = transposeLanes ? inputLane * 4 + outputLane : outputLane * 4 + inputLane;
        writer.setFloat16((base + lane) * 2, value, true);
      }
    }
  }
  return new Uint8Array(target);
}

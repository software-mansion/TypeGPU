import { DepthDType } from './types.ts';
import type { DepthBundle, DepthTensor, DepthWeightSection } from './types.ts';

interface WinogradPackedWeight {
  readonly bytes: Uint8Array;
  readonly nativeF16: boolean;
}

function f4FilterTransform(a: number, b: number, c: number, row: number): number {
  if (row === 0) {
    return a / 4;
  }
  if (row === 1) {
    return -(a + b + c) / 6;
  }
  if (row === 2) {
    return (-a + b - c) / 6;
  }
  if (row === 3) {
    return a / 24 + b / 12 + c / 6;
  }
  if (row === 4) {
    return a / 24 - b / 12 + c / 6;
  }
  return c;
}

export function tensorSectionBytes(bundle: DepthBundle, tensor: DepthTensor): Uint8Array {
  const storage = tensor.storage as Extract<DepthTensor['storage'], { kind: 'section' }>;
  const section = bundle.weightSectionById.get(storage.sectionId) as DepthWeightSection;
  const start = storage.byteOffset;
  return section.bytes.subarray(start, start + tensor.byteLength);
}

function tensorBytes(bundle: DepthBundle, tensor: DepthTensor): Uint8Array {
  return tensorSectionBytes(bundle, tensor);
}

/** Transforms an O4/I4 3x3 weight into coefficient-major layout for F(4x4,3x3) */
export function transformWinogradF4Weight(
  bundle: DepthBundle,
  tensor: DepthTensor,
  outputChannels: number,
  inputChannels: number,
): WinogradPackedWeight {
  const nativeF16 = tensor.dtype === DepthDType.F16;
  const outputBlocks = Math.ceil(outputChannels / 4);
  const inputBlocks = Math.ceil(inputChannels / 4);
  const source = tensorBytes(bundle, tensor);
  const sourceView = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const scalarBytes = nativeF16 ? 2 : 4;
  const outputScalarCount = 36 * outputBlocks * inputBlocks * 16;
  const output = new ArrayBuffer(outputScalarCount * scalarBytes);
  const outputView = new DataView(output);

  const read = (scalarIndex: number): number =>
    nativeF16
      ? sourceView.getFloat16(scalarIndex * 2, true)
      : sourceView.getFloat32(scalarIndex * 4, true);
  const write = (scalarIndex: number, value: number): void => {
    if (nativeF16) {
      outputView.setFloat16(scalarIndex * 2, value, true);
    } else {
      outputView.setFloat32(scalarIndex * 4, value, true);
    }
  };
  for (let outputBlock = 0; outputBlock < outputBlocks; outputBlock += 1) {
    for (let inputBlock = 0; inputBlock < inputBlocks; inputBlock += 1) {
      for (let outputLane = 0; outputLane < 4; outputLane += 1) {
        for (let inputLane = 0; inputLane < 4; inputLane += 1) {
          const kernel = new Float64Array(9);
          for (let y = 0; y < 3; y += 1) {
            for (let x = 0; x < 3; x += 1) {
              const vec4Index =
                (((outputBlock * inputBlocks + inputBlock) * 3 + y) * 3 + x) * 4 + outputLane;
              kernel[y * 3 + x] = read(vec4Index * 4 + inputLane);
            }
          }
          const rows = new Float64Array(18);
          for (let x = 0; x < 3; x += 1) {
            for (let y = 0; y < 6; y += 1) {
              rows[y * 3 + x] = f4FilterTransform(kernel[x], kernel[3 + x], kernel[6 + x], y);
            }
          }
          for (let y = 0; y < 6; y += 1) {
            for (let x = 0; x < 6; x += 1) {
              const coefficient = y * 6 + x;
              const vec4Index =
                ((coefficient * outputBlocks + outputBlock) * inputBlocks + inputBlock) * 4 +
                outputLane;
              write(
                vec4Index * 4 + inputLane,
                f4FilterTransform(rows[y * 3], rows[y * 3 + 1], rows[y * 3 + 2], x),
              );
            }
          }
        }
      }
    }
  }
  return { bytes: new Uint8Array(output), nativeF16 };
}

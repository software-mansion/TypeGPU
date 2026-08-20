import { DepthDType, DepthTensorLayout } from './types.ts';
import type { DepthBundle, DepthTensor } from './types.ts';

export interface WinogradPackedWeight {
  readonly bytes: Uint8Array;
  readonly nativeF16: boolean;
}

function halfToFloat(bits: number): number {
  const sign = (bits & 0x8000) === 0 ? 1 : -1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) {
    return fraction === 0 ? 0 : sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

const conversionFloat = new Float32Array(1);
const conversionBits = new Uint32Array(conversionFloat.buffer);

export function floatToHalf(value: number): number {
  conversionFloat[0] = value;
  const bits = conversionBits[0] ?? 0;
  const sign = (bits >>> 16) & 0x8000;
  const mantissa = bits & 0x007fffff;
  const exponent = (bits >>> 23) & 0xff;
  if (exponent === 0xff) {
    return sign | (mantissa === 0 ? 0x7c00 : 0x7e00);
  }
  const halfExponent = exponent - 127 + 15;
  if (halfExponent >= 0x1f) {
    return sign | 0x7c00;
  }
  if (halfExponent <= 0) {
    if (halfExponent < -10) {
      return sign;
    }
    const normalized = mantissa | 0x00800000;
    const shift = 14 - halfExponent;
    return sign | ((normalized + (1 << (shift - 1)) - 1 + ((normalized >>> shift) & 1)) >>> shift);
  }
  const rounded = mantissa + 0x00000fff + ((mantissa >>> 13) & 1);
  if ((rounded & 0x00800000) !== 0) {
    const nextExponent = halfExponent + 1;
    return nextExponent >= 0x1f ? sign | 0x7c00 : sign | (nextExponent << 10);
  }
  return sign | (halfExponent << 10) | (rounded >>> 13);
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

/** The bundle bytes backing a section-stored tensor */
export function tensorSectionBytes(
  bundle: DepthBundle,
  tensor: DepthTensor,
  context: string,
): Uint8Array {
  const section =
    tensor.storage.kind === 'section'
      ? bundle.weightSectionById.get(tensor.storage.sectionId)
      : undefined;
  if (section === undefined) {
    throw new Error(`${context} '${tensor.id}' is not section-backed.`);
  }
  const start = tensor.storage.kind === 'section' ? tensor.storage.byteOffset : 0;
  return section.bytes.subarray(start, start + tensor.byteLength);
}

function tensorBytes(bundle: DepthBundle, tensor: DepthTensor): Uint8Array {
  return tensorSectionBytes(bundle, tensor, 'Winograd weight');
}

/** Transforms an O4/I4 3x3 weight into coefficient-major layout for F(4x4,3x3) */
export function transformWinogradF4Weight(
  bundle: DepthBundle,
  tensor: DepthTensor,
  outputChannels: number,
  inputChannels: number,
): WinogradPackedWeight {
  const nativeF16 = tensor.dtype === DepthDType.F16;
  if (tensor.layout !== DepthTensorLayout.O4I4Yx) {
    throw new Error(`Winograd weight '${tensor.id}' requires O4/I4 storage.`);
  }
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
      ? halfToFloat(sourceView.getUint16(scalarIndex * 2, true))
      : sourceView.getFloat32(scalarIndex * 4, true);
  const write = (scalarIndex: number, value: number): void => {
    if (nativeF16) {
      outputView.setUint16(scalarIndex * 2, floatToHalf(value), true);
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
              rows[y * 3 + x] = f4FilterTransform(
                kernel[x] ?? 0,
                kernel[3 + x] ?? 0,
                kernel[6 + x] ?? 0,
                y,
              );
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
                f4FilterTransform(rows[y * 3] ?? 0, rows[y * 3 + 1] ?? 0, rows[y * 3 + 2] ?? 0, x),
              );
            }
          }
        }
      }
    }
  }
  return { bytes: new Uint8Array(output), nativeF16 };
}

import { TensorDataType } from '../../types.ts';
import { bfloat16ToFloat32, float16ToFloat32 } from '../convert.ts';

export function decodeRawData(
  raw: Uint8Array,
  dt: TensorDataType,
  elementCount: number,
): any {
  const off = raw.byteOffset;
  const buf = raw.buffer;
  const len = raw.byteLength;
  type AnyTypedArray =
    | Float32Array
    | Float64Array
    | Int8Array
    | Int16Array
    | Int32Array
    | Uint8Array
    | Uint16Array
    | Uint32Array
    | BigInt64Array
    | BigUint64Array;
  const construct = <T extends AnyTypedArray>(
    Ctor: {
      new (buffer: ArrayBufferLike, byteOffset: number, length: number): T;
      BYTES_PER_ELEMENT: number;
    },
    count = elementCount,
  ): T => {
    const neededBytes = Ctor.BYTES_PER_ELEMENT * count;
    if (neededBytes > len) {
      // Clamp count to available bytes to avoid RangeError; model may be malformed.
      count = Math.floor(len / Ctor.BYTES_PER_ELEMENT);
    }
    if (off % Ctor.BYTES_PER_ELEMENT === 0) {
      try {
        return new Ctor(buf, off, count);
      } catch {
        // fallthrough to copy below
      }
    }
    // Unaligned or failed: copy to aligned buffer
    const copy = raw.slice(0, neededBytes);
    return new Ctor(
      copy.buffer,
      copy.byteOffset,
      Math.floor(copy.byteLength / Ctor.BYTES_PER_ELEMENT),
    );
  };

  switch (dt) {
    case TensorDataType.FLOAT:
      return construct(Float32Array);
    case TensorDataType.DOUBLE:
      return construct(Float64Array);
    case TensorDataType.INT32:
      return construct(Int32Array);
    case TensorDataType.INT64:
      return construct(BigInt64Array as any);
    case TensorDataType.UINT8:
      return raw; // already byte-aligned
    case TensorDataType.INT8:
      return construct(Int8Array);
    case TensorDataType.UINT16:
      return construct(Uint16Array);
    case TensorDataType.INT16:
      return construct(Int16Array);
    case TensorDataType.UINT32:
      return construct(Uint32Array);
    case TensorDataType.UINT64:
      return construct(BigUint64Array as any);
    case TensorDataType.FLOAT16:
      return float16ToFloat32(construct(Uint16Array));
    case TensorDataType.BFLOAT16:
      return bfloat16ToFloat32(construct(Uint16Array));
    default:
      return raw; // unsupported types remain raw
  }
}

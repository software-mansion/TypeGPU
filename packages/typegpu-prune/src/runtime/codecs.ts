import type { ArrayCodecArtifact, Codec, Reader, ScalarKind, Writer } from '../artifact.ts';

type Setter = 'setFloat32' | 'setFloat16' | 'setUint32' | 'setInt32';
type Getter = 'getFloat32' | 'getFloat16' | 'getUint32' | 'getInt32';

const access: Record<ScalarKind, [Setter, Getter]> = {
  f32: ['setFloat32', 'getFloat32'],
  f16: ['setFloat16', 'getFloat16'],
  u32: ['setUint32', 'getUint32'],
  i32: ['setInt32', 'getInt32'],
};

/**
 * The writer and reader of an array of scalars, the same as the ones generated for other
 * schemas: typed arrays and buffers are copied as bytes, a write from `offset` stops at
 * `endOffset`.
 */
export function arrayCodec({ size, align, array }: ArrayCodecArtifact): Codec {
  const { count, stride } = array;
  const [setter, getter] = access[array.element];
  // DataView.prototype.setFloat16 is not in every lib yet
  const view = DataView.prototype as unknown as Record<
    Setter,
    (this: DataView, offset: number, value: number, littleEndian: boolean) => void
  > &
    Record<Getter, (this: DataView, offset: number, littleEndian: boolean) => number>;
  const set = view[setter];
  const get = view[getter];

  const write: Writer = (
    output,
    offset,
    value,
    littleEndian = true,
    endOffset = output.byteLength,
  ) => {
    const partial = offset > 0 || endOffset < output.byteLength;
    if (ArrayBuffer.isView(value)) {
      const bytes = partial
        ? Math.min(value.byteLength, Math.max(0, endOffset - offset))
        : Math.min(value.byteLength, size);
      new Uint8Array(output.buffer).set(
        new Uint8Array(value.buffer, value.byteOffset, bytes),
        output.byteOffset + offset,
      );
      return;
    }
    const items = value as ArrayLike<number>;
    for (let i = 0; i < count; i++) {
      const at = offset + i * stride;
      if (partial && at >= endOffset) {
        return;
      }
      set.call(output, at, items[i] as number, littleEndian);
    }
  };
  const read: Reader = (input, offset, littleEndian = true) =>
    Array.from({ length: count }, (_, i) => get.call(input, offset + i * stride, littleEndian));

  return { size, align, write, read };
}

/** Codecs as emitted: generated ones as-is, array codecs built from their data */
export function hydrateCodec(codec: Codec | ArrayCodecArtifact): Codec {
  return 'array' in codec ? arrayCodec(codec) : codec;
}

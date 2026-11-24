import type {
  ArrayCodecArtifact,
  Codec,
  CodecArtifact,
  Reader,
  RuntimeArrayCodecArtifact,
  ScalarKind,
  Writer,
} from '../artifact.ts';

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

  return { size, align, write, read, elementCount: count };
}

/** A runtime-sized array codec: a codec of no elements, and the codec of any length of them */
export interface RuntimeArrayCodec extends Codec {
  ofLength(length: number): Codec;
}

/** An array of `count` elements of a codec, each written and read at its own stride */
function elementsCodec(element: Codec, count: number, stride: number, align: number): Codec {
  const { write: writeElement, read: readElement } = element;
  const write: Writer | undefined =
    writeElement &&
    ((output, offset, value, littleEndian = true, endOffset = output.byteLength) => {
      const items = value as ArrayLike<unknown>;
      for (let i = 0; i < count; i++) {
        const at = offset + i * stride;
        if (at >= endOffset) {
          return;
        }
        writeElement(output, at, items[i], littleEndian, endOffset);
      }
    });
  const read: Reader | undefined =
    readElement &&
    ((input, offset, littleEndian = true) =>
      Array.from({ length: count }, (_, i) =>
        readElement(input, offset + i * stride, littleEndian),
      ));
  return { size: count * stride, align, write, read, elementCount: count };
}

/** Linked by `hydrateCodecs` once every codec exists */
type Linkable = { elementType?: Codec | undefined };

function runtimeArrayCodec({ align, runtimeArray }: RuntimeArrayCodecArtifact): RuntimeArrayCodec {
  const { element, stride } = runtimeArray;
  const codec: RuntimeArrayCodec & Linkable = { size: 0, align, elementCount: 0, ofLength };
  const elementCodec = typeof element === 'string' ? undefined : hydrateCodec(element);
  const lengths = new Map<number, Codec>();
  function ofLength(length: number): Codec {
    if (!Number.isInteger(length) || length < 0) {
      throw new Error(`Cannot create array schema with invalid element count: ${length}.`);
    }
    let sized = lengths.get(length);
    if (!sized) {
      const elements =
        typeof element === 'string'
          ? arrayCodec({
              size: length * stride,
              align,
              array: { element, count: length, stride },
            })
          : elementsCodec(elementCodec as Codec, length, stride, align);
      sized = { ...elements, elementType: codec.elementType };
      lengths.set(length, sized);
    }
    return sized;
  }
  return codec;
}

/**
 * Codecs as emitted, with runtime-sized arrays linked to the codecs of their elements, so that
 * `elementType` of each length is the codec returned for the element schema
 */
export function hydrateCodecs(emitted: readonly CodecArtifact[]): Codec[] {
  const codecs = emitted.map(hydrateCodec);
  emitted.forEach((art, idx) => {
    const elementType = 'runtimeArray' in art ? art.runtimeArray.elementType : undefined;
    if (elementType !== undefined) {
      (codecs[idx] as Linkable).elementType = codecs[elementType];
    }
  });
  return codecs;
}

/** Codecs as emitted: generated ones as-is, array codecs built from their data */
function hydrateCodec(codec: CodecArtifact): Codec {
  if ('array' in codec) {
    return arrayCodec(codec);
  }
  if ('runtimeArray' in codec) {
    return runtimeArrayCodec(codec);
  }
  return codec;
}

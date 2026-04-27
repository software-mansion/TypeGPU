import { BufferReader, BufferWriter, getSystemEndianness } from 'typed-binary';
import type { BaseData } from '../../data/wgslTypes.ts';
import type { Infer, InferInput } from '../../shared/repr.ts';
import type { BufferWriteOptions } from './buffer.ts'; // TODO: move this to a separate file
import { getCompiledWriter } from '../../data/compiledIO.ts';
import { readData, writeData } from '../../data/dataIO.ts';
import { getName } from '../../shared/meta.ts';

const endianness = getSystemEndianness();

export function writeToArrayBuffer<T extends BaseData>(
  buffer: ArrayBuffer,
  schema: T,
  data: InferInput<T> | ArrayBuffer,
  options?: BufferWriteOptions,
) {
  const startOffset = options?.startOffset ?? 0;
  const endOffset = options?.endOffset ?? buffer.byteLength;

  // Fast path: raw byte copy, user guarantees the padded layout
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    const src =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const regionSize = endOffset - startOffset;
    if (src.byteLength !== regionSize) {
      console.warn(
        `Buffer size mismatch: expected ${regionSize} bytes, got ${src.byteLength}. ` +
          (src.byteLength < regionSize ? 'Data truncated.' : 'Excess ignored.'),
      );
    }
    const copyLen = Math.min(src.byteLength, regionSize);
    new Uint8Array(buffer).set(src.subarray(0, copyLen), startOffset);
    return;
  }

  const dataView = new DataView(buffer);
  const isLittleEndian = endianness === 'little';

  const compiledWriter = getCompiledWriter(schema);

  if (compiledWriter) {
    try {
      compiledWriter(dataView, startOffset, data, isLittleEndian, endOffset);
      return;
    } catch (error) {
      console.error(
        `Error when using compiled writer for data type '${
          schema.type
        }' (${getName(schema) ?? 'unnamed'}) - this is likely a bug, please submit an issue at https://github.com/software-mansion/TypeGPU/issues\nUsing fallback writer instead.`,
        error,
      );
    }
  }

  const writer = new BufferWriter(buffer);
  writer.seekTo(startOffset);
  writeData(writer, schema, data as Infer<T>);
}

export function readFromArrayBuffer<T extends BaseData>(buffer: ArrayBuffer, schema: T): Infer<T> {
  return readData(new BufferReader(buffer), schema);
}

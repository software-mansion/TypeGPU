import { BufferWriter, getSystemEndianness } from 'typed-binary';
import { roundUp } from '../mathUtils.ts';
import { alignmentOf } from './alignmentOf.ts';
import { getCompiledWriter } from './compiledIO.ts';
import { writeData } from './dataIO.ts';
import { isDisarray, isUnstruct } from './dataTypes.ts';
import { offsetsForProps } from './offsets.ts';
import { sizeOf } from './sizeOf.ts';
import type * as wgsl from './wgslTypes.ts';
import { isWgslArray, isWgslStruct } from './wgslTypes.ts';

export interface WriteInstruction {
  data: Uint8Array<ArrayBuffer>;
  gpuOffset: number;
}

/**
 * Converts `{idx, value}[]` sparse arrays into `Record<number, T>` format.
 */
export function convertPartialToPatch(schema: wgsl.BaseData, data: unknown): unknown {
  if (data === undefined || data === null) {
    return data;
  }

  if (isWgslStruct(schema) || isUnstruct(schema)) {
    const result: Record<string, unknown> = {};
    const record = data as Record<string, unknown>;
    for (const key of Object.keys(schema.propTypes)) {
      const subSchema = schema.propTypes[key];
      const value = record[key];
      if (value !== undefined && subSchema) {
        result[key] = convertPartialToPatch(subSchema, value);
      }
    }
    return result;
  }

  if (isWgslArray(schema) || isDisarray(schema)) {
    const arrSchema = schema as wgsl.WgslArray;
    const result: Record<number, unknown> = {};
    for (const { idx, value } of data as { idx: number; value: unknown }[]) {
      result[idx] = convertPartialToPatch(arrSchema.elementType, value);
    }
    return result;
  }

  return data;
}

const isLittleEndian = getSystemEndianness() === 'little';

interface Segment {
  start: number;
  end: number;
  padding?: number | undefined;
}

export function getPatchInstructions<TData extends wgsl.BaseData>(
  schema: TData,
  data: unknown,
  targetBuffer?: ArrayBuffer,
): WriteInstruction[] {
  const totalSize = sizeOf(schema);
  if (totalSize === 0 || data === undefined || data === null) {
    return [];
  }

  const buf = targetBuffer ?? new ArrayBuffer(totalSize);
  const writer = new BufferWriter(buf);

  const segments: Segment[] = [];

  function collect(node: wgsl.BaseData, value: unknown, offset: number, padding?: number) {
    if (value === undefined || value === null) {
      return;
    }

    if (isWgslStruct(node) || isUnstruct(node)) {
      const propOffsets = offsetsForProps(node);
      for (const [key, propOffset] of Object.entries(propOffsets)) {
        const childValue = (value as Record<string, unknown>)[key];
        const subSchema = node.propTypes[key];
        if (childValue !== undefined && subSchema) {
          collect(subSchema, childValue, offset + propOffset.offset, propOffset.padding ?? padding);
        }
      }
      return;
    }

    if (isWgslArray(node) || isDisarray(node)) {
      const arrSchema = node as wgsl.WgslArray;
      const elementSize = roundUp(
        sizeOf(arrSchema.elementType),
        alignmentOf(arrSchema.elementType),
      );
      const elementPadding = elementSize - sizeOf(arrSchema.elementType);

      if (ArrayBuffer.isView(value)) {
        const copyLen = Math.min(value.byteLength, arrSchema.elementCount * elementSize);
        new Uint8Array(buf, offset, copyLen).set(
          new Uint8Array(value.buffer, value.byteOffset, copyLen),
        );
        segments.push({ start: offset, end: offset + copyLen, padding });
        return;
      }

      if (Array.isArray(value)) {
        for (let i = 0; i < Math.min(arrSchema.elementCount, value.length); i++) {
          collect(arrSchema.elementType, value[i], offset + i * elementSize, elementPadding);
        }
        return;
      }

      const sparse = value as Record<string, unknown>;
      for (const key of Object.keys(sparse)) {
        const idx = Number(key);
        if (!Number.isNaN(idx)) {
          collect(arrSchema.elementType, sparse[key], offset + idx * elementSize, elementPadding);
        }
      }
      return;
    }

    const leafSize = sizeOf(node);
    const compiledWriter = getCompiledWriter(node);
    if (compiledWriter) {
      compiledWriter(new DataView(buf), offset, value, isLittleEndian, offset + leafSize);
    } else {
      writer.seekTo(offset);
      writeData(writer, node, value);
    }
    segments.push({ start: offset, end: offset + leafSize, padding });
  }

  collect(schema, data, 0);
  segments.sort((a, b) => a.start - b.start);

  const instructions: WriteInstruction[] = [];
  let run: Segment | null = null;

  for (const seg of segments) {
    if (run && seg.start === run.end + (run.padding ?? 0)) {
      run = { start: run.start, end: seg.end, padding: seg.padding };
    } else {
      if (run) {
        instructions.push({
          gpuOffset: run.start,
          data: new Uint8Array(buf, run.start, run.end - run.start),
        });
      }
      run = seg;
    }
  }
  if (run) {
    instructions.push({
      gpuOffset: run.start,
      data: new Uint8Array(buf, run.start, run.end - run.start),
    });
  }

  return instructions;
}

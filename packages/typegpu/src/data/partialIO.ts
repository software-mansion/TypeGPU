import { BufferWriter } from 'typed-binary';
import { roundUp } from '../mathUtils';
import type { Infer, InferPartial } from '../shared/repr';
import { alignmentOf } from './alignmentOf';
import { writeData } from './dataIO';
import { isDisarray, isUnstruct } from './dataTypes';
import { offsetsForProps } from './offests';
import { sizeOf } from './sizeOf';
import type * as wgsl from './wgslTypes';
import { isWgslArray, isWgslStruct } from './wgslTypes';

export interface WriteInstruction {
  start: number;
  length: number;
  data: Uint8Array;
}

export function getWriteInstructions<TData extends wgsl.BaseWgslData>(
  schema: TData,
  data: InferPartial<TData>,
): WriteInstruction[] {
  const totalSize = sizeOf(schema);
  if (totalSize === 0 || data === undefined || data === null) {
    return [];
  }

  const bigBuffer = new ArrayBuffer(totalSize);
  const writer = new BufferWriter(bigBuffer);

  const segments: Array<{ start: number; end: number }> = [];

  function gatherAndWrite<T extends wgsl.BaseWgslData>(
    node: T,
    partialValue: InferPartial<T> | undefined,
    offset: number,
  ) {
    if (partialValue === undefined || partialValue === null) {
      return;
    }

    if (isWgslStruct(node) || isUnstruct(node)) {
      const propOffsets = offsetsForProps(node);

      const sortedProps = Object.entries(propOffsets).sort(
        (a, b) => a[1] - b[1], // Sort by offset
      );

      for (const [key, propOffset] of sortedProps) {
        const subSchema = node.propTypes[key];
        if (!subSchema) continue;

        const childValue = partialValue[key as keyof typeof partialValue];
        if (childValue !== undefined) {
          gatherAndWrite(subSchema, childValue, offset + propOffset);
        }
      }
      return;
    }

    if (isWgslArray(node) || isDisarray(node)) {
      const arrSchema = node as wgsl.WgslArray<wgsl.AnyWgslData>;
      const elementSize = roundUp(
        sizeOf(arrSchema.elementType),
        alignmentOf(arrSchema.elementType),
      );

      const indices = Object.keys(partialValue)
        .map(Number)
        .sort((a, b) => a - b); // Sort by index
      for (const i of indices) {
        const partialKey = i as keyof typeof partialValue;
        if (partialValue[partialKey] !== undefined) {
          gatherAndWrite(
            arrSchema.elementType,
            partialValue[partialKey],
            offset + i * elementSize,
          );
        }
      }
      return;
    }

    const leafSize = sizeOf(node);
    writer.seekTo(offset);
    writeData(writer, node, partialValue as Infer<T>);

    segments.push({ start: offset, end: offset + leafSize });
  }

  gatherAndWrite(schema, data, 0);

  if (segments.length === 0) {
    return [];
  }

  segments.sort((a, b) => a.start - b.start);

  const instructions: WriteInstruction[] = [];
  let current = segments[0];

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    if (!next || !current) {
      throw new Error('Internal error: missing segment');
    }
    if (next.start === current.end) {
      current.end = next.end;
    } else {
      instructions.push({
        start: current.start,
        length: current.end - current.start,
        data: new Uint8Array(
          bigBuffer,
          current.start,
          current.end - current.start,
        ),
      });
      current = next;
    }
  }

  if (!current) {
    throw new Error('Internal error: missing segment');
  }

  instructions.push({
    start: current.start,
    length: current.end - current.start,
    data: new Uint8Array(bigBuffer, current.start, current.end - current.start),
  });

  return instructions;
}

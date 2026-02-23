import { BufferWriter } from 'typed-binary';
import { roundUp } from '../mathUtils.ts';
import type { Infer, InferPartial } from '../shared/repr.ts';
import { alignmentOf } from './alignmentOf.ts';
import { writeData } from './dataIO.ts';
import { isDisarray, isUnstruct } from './dataTypes.ts';
import { offsetsForProps } from './offsets.ts';
import { sizeOf } from './sizeOf.ts';
import type * as wgsl from './wgslTypes.ts';
import { isWgslArray, isWgslStruct } from './wgslTypes.ts';

export interface WriteInstruction {
  data: Uint8Array<ArrayBuffer>;
}

export function getWriteInstructions<TData extends wgsl.BaseData>(
  schema: TData,
  data: InferPartial<TData>,
): WriteInstruction[] {
  const totalSize = sizeOf(schema);
  if (totalSize === 0 || data === undefined || data === null) {
    return [];
  }

  const bigBuffer = new ArrayBuffer(totalSize);
  const writer = new BufferWriter(bigBuffer);

  const segments: Array<{
    start: number;
    end: number;
    padding?: number | undefined;
  }> = [];

  function gatherAndWrite<T extends wgsl.BaseData>(
    node: T,
    partialValue: InferPartial<T> | undefined,
    offset: number,
    padding?: number,
  ) {
    if (partialValue === undefined || partialValue === null) {
      return;
    }

    if (isWgslStruct(node) || isUnstruct(node)) {
      const propOffsets = offsetsForProps(node);

      for (const [key, propOffset] of Object.entries(propOffsets)) {
        const subSchema = node.propTypes[key];
        if (!subSchema) {
          continue;
        }

        const childValue = partialValue[key as keyof typeof partialValue];
        if (childValue !== undefined) {
          gatherAndWrite(
            subSchema,
            childValue,
            offset + propOffset.offset,
            propOffset.padding ?? padding,
          );
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

      if (!Array.isArray(partialValue)) {
        throw new Error('Partial value for array must be an array');
      }
      const arrayPartialValue =
        (partialValue as InferPartial<wgsl.WgslArray>) ?? [];

      arrayPartialValue.sort((a, b) => a.idx - b.idx);

      for (const { idx, value } of arrayPartialValue) {
        gatherAndWrite(
          arrSchema.elementType,
          value,
          offset + idx * elementSize,
          elementSize - sizeOf(arrSchema.elementType),
        );
      }
    } else {
      const leafSize = sizeOf(node);
      writer.seekTo(offset);
      writeData(writer, node, partialValue as Infer<T>);

      segments.push({ start: offset, end: offset + leafSize, padding });
    }
  }

  gatherAndWrite(schema, data, 0);

  if (segments.length === 0) {
    return [];
  }

  const instructions: WriteInstruction[] = [];
  let current = segments[0];

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    if (!next || !current) {
      throw new Error('Internal error: missing segment');
    }
    if (next.start === current.end + (current.padding ?? 0)) {
      current.end = next.end;
      current.padding = next.padding;
    } else {
      instructions.push({
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
    data: new Uint8Array(bigBuffer, current.start, current.end - current.start),
  });

  return instructions;
}

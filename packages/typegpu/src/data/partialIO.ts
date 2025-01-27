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
  data: ArrayBuffer;
}

export function getWriteInstructions<TData extends wgsl.BaseWgslData>(
  schema: TData,
  data: InferPartial<TData>,
  instructions: WriteInstruction[] = [],
  offset = 0,
): WriteInstruction[] {
  if (isWgslStruct(schema) || isUnstruct(schema)) {
    for (const key in schema.propTypes) {
      const prop = schema.propTypes[key];
      if (prop === undefined) {
        throw new Error(`Property ${key} is undefined in struct`);
      }
      const typedData = data as Record<string, InferPartial<wgsl.AnyWgslData>>;
      const propData = typedData[key];
      if (propData !== undefined) {
        const propOffset = offsetsForProps(schema)[key];
        if (propOffset === undefined) {
          throw new Error(`Offset for property ${key} is undefined`);
        }
        const newOffset = propOffset + offset;
        getWriteInstructions(prop, propData, instructions, newOffset);
      }
    }

    return instructions;
  }

  if (isWgslArray(schema) || isDisarray(schema)) {
    const arraySchema = schema as wgsl.WgslArray<wgsl.AnyWgslData>;
    const elementSize = roundUp(
      sizeOf(arraySchema.elementType),
      alignmentOf(arraySchema.elementType),
    );

    const selectedElements = data as Record<
      number,
      InferPartial<wgsl.AnyWgslData>
    >;
    for (const index in selectedElements) {
      const elementData = selectedElements[index];
      const newOffset = offset + elementSize * Number(index);
      getWriteInstructions(
        arraySchema.elementType,
        elementData,
        instructions,
        newOffset,
      );
    }

    return instructions;
  }

  if (data !== undefined) {
    const dataLength = sizeOf(schema);
    const dataBytes = new ArrayBuffer(dataLength);
    writeData(new BufferWriter(dataBytes), schema, data as Infer<TData>);
    instructions.push({
      start: offset,
      length: dataLength,
      data: dataBytes,
    });
  }

  return instructions;
}

export function combineContiguousInstructions(
  instructions: WriteInstruction[],
  sort = false,
): WriteInstruction[] {
  if (instructions.length === 0) return instructions;

  // The instructions should always already be sorted (?) if coming from getWriteInstructions
  if (sort) {
    instructions.sort((a, b) => a.start - b.start);
  }

  const combinedInstructions: WriteInstruction[] = [];
  let currentInstruction = instructions[0];

  for (let i = 1; i < instructions.length; i++) {
    const nextInstruction = instructions[i];

    if (currentInstruction === undefined || nextInstruction === undefined) {
      throw new Error('Instruction is undefined');
    }

    if (
      currentInstruction.start + currentInstruction.length ===
      nextInstruction.start
    ) {
      // They are contiguous, so combine them
      const combinedLength = currentInstruction.length + nextInstruction.length;
      const combinedData = new ArrayBuffer(combinedLength);
      const combinedView = new Uint8Array(combinedData);

      // Copy data from current instruction
      combinedView.set(new Uint8Array(currentInstruction.data), 0);

      // Copy data from next instruction
      combinedView.set(
        new Uint8Array(nextInstruction.data),
        currentInstruction.length,
      );

      // Update the current instruction with the combined data
      currentInstruction = {
        start: currentInstruction.start,
        length: combinedLength,
        data: combinedData,
      };
    } else {
      // Not contiguous, push the current instruction and move to the next
      combinedInstructions.push(currentInstruction);
      currentInstruction = nextInstruction;
    }
  }

  if (currentInstruction !== undefined) {
    combinedInstructions.push(currentInstruction);
  }

  return combinedInstructions;
}

export function partialWrite<TData extends wgsl.BaseWgslData>(
  schema: TData,
  data: InferPartial<TData>,
): WriteInstruction[] {
  const instructions = getWriteInstructions(schema, data);
  return combineContiguousInstructions(instructions);
}

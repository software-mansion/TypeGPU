import { BufferWriter, getSystemEndianness } from 'typed-binary';
import { roundUp } from '../mathUtils.ts';
import type { InferPartial } from '../shared/repr.ts';
import { alignmentOf } from './alignmentOf.ts';
import { type CompiledWriter, getCompiledWriter } from './compiledIO.ts';
import { writeData } from './dataIO.ts';
import { isDisarray, isUnstruct, type Unstruct } from './dataTypes.ts';
import { offsetsForProps } from './offsets.ts';
import { sizeOf } from './sizeOf.ts';
import type * as wgsl from './wgslTypes.ts';
import { isWgslArray, isWgslStruct } from './wgslTypes.ts';

export interface WriteInstruction {
  data: Uint8Array<ArrayBuffer>;
  gpuOffset: number;
}

interface Update {
  offset: number;
  size: number;
  padding: number;
  write: (view: DataView, localOffset: number) => void;
}

const isLittleEndian = getSystemEndianness() === 'little';

function isSparseArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    'idx' in (value[0] as object)
  );
}

/**
 * Can the partial value be passed directly to the struct's compiled writer?
 * True when every field is present and no array field uses sparse format.
 */
function canUseDirectWriter(
  node: wgsl.WgslStruct | Unstruct,
  value: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(offsetsForProps(node))) {
    const childValue = value[key];
    if (childValue === undefined || childValue === null) {
      return false;
    }

    const subSchema = node.propTypes[key];

    if ((isWgslArray(subSchema) || isDisarray(subSchema)) && isSparseArray(childValue)) {
      return false;
    }

    if (
      (isWgslStruct(subSchema) || isUnstruct(subSchema)) &&
      !canUseDirectWriter(subSchema as wgsl.WgslStruct, childValue as Record<string, unknown>)
    ) {
      return false;
    }
  }
  return true;
}

function makeWriteFn(
  writer: CompiledWriter | undefined,
  node: wgsl.BaseData,
  size: number,
  value: unknown,
): (view: DataView, localOffset: number) => void {
  if (writer) {
    return (view, localOffset) =>
      writer(view, localOffset, value, isLittleEndian, localOffset + size);
  }
  return (view, localOffset) => {
    const bw = new BufferWriter(view.buffer, { byteOffset: view.byteOffset });
    bw.seekTo(localOffset);
    writeData(bw, node, value);
  };
}

export function getWriteInstructions<TData extends wgsl.BaseData>(
  schema: TData,
  data: InferPartial<TData>,
): WriteInstruction[] {
  if (sizeOf(schema) === 0 || data === undefined || data === null) {
    return [];
  }

  const updates: Update[] = [];

  function collect(node: wgsl.BaseData, partialValue: unknown, offset: number, padding: number) {
    if (partialValue === undefined || partialValue === null) {
      return;
    }

    if (isWgslStruct(node) || isUnstruct(node)) {
      const writer = canUseDirectWriter(node, partialValue as Record<string, unknown>)
        ? getCompiledWriter(node)
        : undefined;

      if (writer) {
        const nodeSize = sizeOf(node);
        updates.push({
          offset,
          size: nodeSize,
          padding,
          write: makeWriteFn(writer, node, nodeSize, partialValue),
        });
        return;
      }

      const propOffsets = offsetsForProps(node);
      for (const key of Object.keys(propOffsets)) {
        const propOffset = propOffsets[key];
        const subSchema = node.propTypes[key];
        if (!subSchema || !propOffset) {
          continue;
        }

        const childValue = (partialValue as Record<string, unknown>)[key];
        if (childValue !== undefined) {
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

      if (ArrayBuffer.isView(partialValue)) {
        const src = partialValue;
        const copyLen = Math.min(src.byteLength, arrSchema.elementCount * elementSize);
        updates.push({
          offset,
          size: copyLen,
          padding,
          write: (view, localOffset) => {
            new Uint8Array(view.buffer, view.byteOffset + localOffset, copyLen).set(
              new Uint8Array(src.buffer, src.byteOffset, copyLen),
            );
          },
        });
        return;
      }

      if (!Array.isArray(partialValue)) {
        throw new Error('Partial value for array must be an array');
      }

      if (isSparseArray(partialValue)) {
        const entries = partialValue as { idx: number; value: unknown }[];
        entries.sort((a, b) => a.idx - b.idx);
        for (const { idx, value } of entries) {
          collect(arrSchema.elementType, value, offset + idx * elementSize, elementPadding);
        }
        return;
      }

      // Full replacement with plain array
      const arrWriter = getCompiledWriter(node);
      if (arrWriter) {
        const arrSize = arrSchema.elementCount * elementSize;
        updates.push({
          offset,
          size: arrSize,
          padding,
          write: makeWriteFn(arrWriter, node, arrSize, partialValue),
        });
      } else {
        for (let i = 0; i < Math.min(arrSchema.elementCount, partialValue.length); i++) {
          collect(arrSchema.elementType, partialValue[i], offset + i * elementSize, elementPadding);
        }
      }
      return;
    }

    // Leaf (vec, mat, scalar, packed)
    const leafSize = sizeOf(node);
    updates.push({
      offset,
      size: leafSize,
      padding,
      write: makeWriteFn(getCompiledWriter(node), node, leafSize, partialValue),
    });
  }

  collect(schema, data, 0, 0);

  if (updates.length === 0) {
    return [];
  }

  // Coalesce adjacent updates (bridging known alignment padding) into runs
  updates.sort((a, b) => a.offset - b.offset);

  const first = updates[0];
  if (!first) {
    return [];
  }

  const instructions: WriteInstruction[] = [];
  let run = {
    start: first.offset,
    end: first.offset + first.size,
    padding: first.padding,
    entries: [first],
  };

  for (let i = 1; i < updates.length; i++) {
    const u = updates[i];
    if (!u) {
      continue;
    }
    if (u.offset === run.end + run.padding) {
      run.end = u.offset + u.size;
      run.padding = u.padding;
      run.entries.push(u);
    } else {
      instructions.push(flushRun(run));
      run = { start: u.offset, end: u.offset + u.size, padding: u.padding, entries: [u] };
    }
  }
  instructions.push(flushRun(run));

  return instructions;
}

function flushRun(run: { start: number; end: number; entries: Update[] }): WriteInstruction {
  const runSize = run.end - run.start;
  const buf = new ArrayBuffer(runSize);
  const view = new DataView(buf);

  for (const entry of run.entries) {
    entry.write(view, entry.offset - run.start);
  }

  return { gpuOffset: run.start, data: new Uint8Array(buf) };
}

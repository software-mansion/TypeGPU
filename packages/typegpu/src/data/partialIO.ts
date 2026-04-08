import { BufferWriter, getSystemEndianness } from 'typed-binary';
import { roundUp } from '../mathUtils.ts';
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

/**
 * Converts a value in the legacy `InferPartial` format (with `{idx, value}[]`
 * sparse arrays) into the `InferPatch` format (with `Record<number, T>`).
 * Dense arrays, typed arrays, and leaves are already patch-compatible and
 * pass through untouched.
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

  if (
    (isWgslArray(schema) || isDisarray(schema)) &&
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0] === 'object' &&
    data[0] !== null &&
    'idx' in data[0]
  ) {
    const arrSchema = schema as wgsl.WgslArray;
    const result: Record<number, unknown> = {};
    for (const entry of data as { idx: number; value: unknown }[]) {
      result[entry.idx] = convertPartialToPatch(arrSchema.elementType, entry.value);
    }
    return result;
  }

  return data;
}

const isLittleEndian = getSystemEndianness() === 'little';

interface Update {
  offset: number;
  size: number;
  padding: number;
  write: (view: DataView, localOffset: number) => void;
}

/**
 * Compiled writers require every field to be present and every array field
 * to be in dense form (plain array or TypedArray, not a sparse Record).
 */
function canUseDirectWriter(
  node: wgsl.WgslStruct | Unstruct,
  value: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(node.propTypes)) {
    const childValue = value[key];
    if (childValue === undefined || childValue === null) {
      return false;
    }

    const subSchema = node.propTypes[key];

    if (isWgslStruct(subSchema) || isUnstruct(subSchema)) {
      if (!canUseDirectWriter(subSchema, childValue as Record<string, unknown>)) {
        return false;
      }
    }

    if (
      (isWgslArray(subSchema) || isDisarray(subSchema)) &&
      !Array.isArray(childValue) &&
      !ArrayBuffer.isView(childValue)
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

interface Run {
  start: number;
  end: number;
  padding: number;
  entries: Update[];
}

function flushRun(run: Run): WriteInstruction {
  const buf = new ArrayBuffer(run.end - run.start);
  const view = new DataView(buf);
  for (const entry of run.entries) {
    entry.write(view, entry.offset - run.start);
  }
  return { gpuOffset: run.start, data: new Uint8Array(buf) };
}

function coalesceUpdates(updates: Update[]): WriteInstruction[] {
  updates.sort((a, b) => a.offset - b.offset);

  const instructions: WriteInstruction[] = [];
  let run: Run | null = null;

  for (const u of updates) {
    if (run && u.offset === run.end + run.padding) {
      run.end = u.offset + u.size;
      run.padding = u.padding;
      run.entries.push(u);
    } else {
      if (run) {
        instructions.push(flushRun(run));
      }
      run = { start: u.offset, end: u.offset + u.size, padding: u.padding, entries: [u] };
    }
  }
  if (run) {
    instructions.push(flushRun(run));
  }

  return instructions;
}

export function getPatchInstructions<TData extends wgsl.BaseData>(
  schema: TData,
  data: unknown,
): WriteInstruction[] {
  if (sizeOf(schema) === 0 || data === undefined || data === null) {
    return [];
  }

  const updates: Update[] = [];

  function collectStruct(
    node: wgsl.WgslStruct | Unstruct,
    value: Record<string, unknown>,
    offset: number,
    padding: number,
  ) {
    if (canUseDirectWriter(node, value)) {
      const writer = getCompiledWriter(node);
      if (writer) {
        const nodeSize = sizeOf(node);
        updates.push({
          offset,
          size: nodeSize,
          padding,
          write: makeWriteFn(writer, node, nodeSize, value),
        });
        return;
      }
    }

    const propOffsets = offsetsForProps(node);
    for (const key of Object.keys(propOffsets)) {
      const propOffset = propOffsets[key];
      const subSchema = node.propTypes[key];
      if (!subSchema || !propOffset) {
        continue;
      }
      const childValue = value[key];
      if (childValue !== undefined) {
        collect(subSchema, childValue, offset + propOffset.offset, propOffset.padding ?? padding);
      }
    }
  }

  function collectArrayDense(
    arrSchema: wgsl.WgslArray,
    value: unknown[] | ArrayBufferView,
    offset: number,
    padding: number,
  ) {
    const elementSize = roundUp(sizeOf(arrSchema.elementType), alignmentOf(arrSchema.elementType));

    if (ArrayBuffer.isView(value)) {
      const copyLen = Math.min(value.byteLength, arrSchema.elementCount * elementSize);
      updates.push({
        offset,
        size: copyLen,
        padding,
        write: (view, localOffset) => {
          new Uint8Array(view.buffer, view.byteOffset + localOffset, copyLen).set(
            new Uint8Array(value.buffer, value.byteOffset, copyLen),
          );
        },
      });
      return;
    }

    const arrWriter = getCompiledWriter(arrSchema);
    if (arrWriter) {
      const arrSize = arrSchema.elementCount * elementSize;
      updates.push({
        offset,
        size: arrSize,
        padding,
        write: makeWriteFn(arrWriter, arrSchema, arrSize, value),
      });
      return;
    }

    const elementPadding = elementSize - sizeOf(arrSchema.elementType);
    for (let i = 0; i < Math.min(arrSchema.elementCount, value.length); i++) {
      collect(arrSchema.elementType, value[i], offset + i * elementSize, elementPadding);
    }
  }

  function collect(node: wgsl.BaseData, value: unknown, offset: number, padding: number) {
    if (value === undefined || value === null) {
      return;
    }

    if (isWgslStruct(node) || isUnstruct(node)) {
      collectStruct(node, value as Record<string, unknown>, offset, padding);
      return;
    }

    if (isWgslArray(node) || isDisarray(node)) {
      const arrSchema = node as wgsl.WgslArray;

      if (ArrayBuffer.isView(value) || Array.isArray(value)) {
        collectArrayDense(arrSchema, value, offset, padding);
        return;
      }

      const sparse = value as Record<string, unknown>;
      const elementSize = roundUp(
        sizeOf(arrSchema.elementType),
        alignmentOf(arrSchema.elementType),
      );
      const elementPadding = elementSize - sizeOf(arrSchema.elementType);
      for (const key of Object.keys(sparse)) {
        const idx = Number(key);
        if (!Number.isNaN(idx)) {
          collect(arrSchema.elementType, sparse[key], offset + idx * elementSize, elementPadding);
        }
      }
      return;
    }

    const leafSize = sizeOf(node);
    updates.push({
      offset,
      size: leafSize,
      padding,
      write: makeWriteFn(getCompiledWriter(node), node, leafSize, value),
    });
  }

  collect(schema, data, 0, 0);
  return coalesceUpdates(updates);
}

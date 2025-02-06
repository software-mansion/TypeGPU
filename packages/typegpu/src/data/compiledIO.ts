import { roundUp } from '../mathUtils';
import type { Infer } from '../shared/repr';
import { alignmentOf } from './alignmentOf';
import { isDisarray, isUnstruct } from './dataTypes';
import { offsetsForProps } from './offsets';
import { sizeOf } from './sizeOf';
import {
  isVec,
  isVec2,
  isVec3,
  isVec4,
  isWgslArray,
  isWgslStruct,
} from './wgslTypes';
import type * as wgsl from './wgslTypes';

export let EVAL_ALLOWED_IN_ENV: boolean;

try {
  new Function('return true');
  EVAL_ALLOWED_IN_ENV = true;
} catch {
  EVAL_ALLOWED_IN_ENV = false;
}

const compiledWriters = new WeakMap<
  wgsl.BaseWgslData,
  (
    output: DataView,
    offset: number,
    value: unknown,
    endianness?: boolean,
  ) => void
>();

export interface CompiledWriteInstructions {
  primitive: 'u32' | 'i32' | 'f32';
  offset: number;
  path: string[];
}

const typeToPrimitive = {
  u32: 'u32',
  vec2u: 'u32',
  vec3u: 'u32',
  vec4u: 'u32',

  i32: 'i32',
  vec2i: 'i32',
  vec3i: 'i32',
  vec4i: 'i32',

  f32: 'f32',
  vec2f: 'f32',
  vec3f: 'f32',
  vec4f: 'f32',

  vec2h: 'f32',
  vec3h: 'f32',
  vec4h: 'f32',
} as const;

const primitiveToWriteFunction = {
  u32: 'setUint32',
  i32: 'setInt32',
  f32: 'setFloat32',
} as const;

export function createCompileInstructions<TData extends wgsl.BaseWgslData>(
  schema: TData,
) {
  const segments: CompiledWriteInstructions[] = [];

  function gather<T extends wgsl.BaseWgslData>(
    node: T,
    offset: number,
    path: string[],
  ) {
    if (isWgslStruct(node) || isUnstruct(node)) {
      const propOffsets = offsetsForProps(node);

      const sortedProps = Object.entries(propOffsets).sort(
        (a, b) => a[1].offset - b[1].offset, // Sort by offset
      );

      for (const [key, propOffset] of sortedProps) {
        const subSchema = node.propTypes[key];
        if (!subSchema) continue;

        gather(subSchema, offset + propOffset.offset, [...path, key]);
      }
      return;
    }

    if (isWgslArray(node) || isDisarray(node)) {
      const arrSchema = node as wgsl.WgslArray;
      const elementSize = roundUp(
        sizeOf(arrSchema.elementType),
        alignmentOf(arrSchema.elementType),
      );

      for (let i = 0; i < arrSchema.elementCount; i++) {
        const newPath = [...path];
        const last = newPath.pop();
        if (last !== undefined) {
          newPath.push(`${last}[${i}]`);
        } else {
          newPath.push(`[${i}]`);
        }
        gather(arrSchema.elementType, offset + i * elementSize, newPath);
      }
      return;
    }

    if (isVec(node)) {
      const primitive = typeToPrimitive[node.type];
      if (isVec2(node)) {
        segments.push({ primitive, offset, path: [...path, 'x'] });
        segments.push({ primitive, offset: offset + 4, path: [...path, 'y'] });
      }
      if (isVec3(node)) {
        segments.push({ primitive, offset, path: [...path, 'x'] });
        segments.push({ primitive, offset: offset + 4, path: [...path, 'y'] });
        segments.push({ primitive, offset: offset + 8, path: [...path, 'z'] });
      }
      if (isVec4(node)) {
        segments.push({ primitive, offset, path: [...path, 'x'] });
        segments.push({ primitive, offset: offset + 4, path: [...path, 'y'] });
        segments.push({ primitive, offset: offset + 8, path: [...path, 'z'] });
        segments.push({ primitive, offset: offset + 12, path: [...path, 'w'] });
      }

      return;
    }

    const primitive =
      typeToPrimitive[node.type as keyof typeof typeToPrimitive];
    segments.push({ primitive, offset, path });
  }

  gather(schema, 0, []);

  return segments;
}

function buildAccessor(path: string[]) {
  const rootIsArray = path[0]?.startsWith('[');

  if (rootIsArray) {
    const index = path.shift();
    return `value${index}${path.map((p) => `.${p}`).join('')}`;
  }

  return path.length === 0 ? 'value' : `value.${path.join('.')}`;
}

export function getCompiledWriterForSchema<T extends wgsl.BaseWgslData>(
  schema: T,
): (
  output: DataView,
  offset: number,
  value: Infer<T>,
  endianness?: boolean,
) => void {
  if (compiledWriters.has(schema)) {
    return compiledWriters.get(schema) as (
      output: DataView,
      offset: number,
      value: Infer<T>,
      endianness?: boolean,
    ) => void;
  }

  const instructions = createCompileInstructions(schema);

  const body = instructions
    .map(
      ({ primitive, offset, path }) =>
        `output.${primitiveToWriteFunction[primitive]}(offset+${offset}, ${buildAccessor(path)}, endianness)`,
    )
    .join('\n');

  const fn = new Function(
    'output',
    'offset',
    'value',
    'endianness=true',
    body,
  ) as (
    output: DataView,
    offset: number,
    value: Infer<T> | unknown,
    endianness?: boolean,
  ) => void;

  compiledWriters.set(schema, fn);

  return fn;
}

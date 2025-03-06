import { roundUp } from '../mathUtils';
import type { Infer } from '../shared/repr';
import { alignmentOf } from './alignmentOf';
import { isDisarray, isUnstruct } from './dataTypes';
import { offsetsForProps } from './offsets';
import { sizeOf } from './sizeOf';
import * as wgsl from './wgslTypes';

export let EVAL_ALLOWED_IN_ENV: boolean;

try {
  new Function('return true');
  EVAL_ALLOWED_IN_ENV = true;
} catch {
  EVAL_ALLOWED_IN_ENV = false;
}

const compiledWriters = new WeakMap<
  wgsl.BaseData,
  (
    output: DataView,
    offset: number,
    value: unknown,
    endianness?: boolean,
  ) => void
>();

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

export function buildWriter(
  node: wgsl.BaseData,
  offsetExpr: string,
  valueExpr: string,
): string {
  if (wgsl.isWgslStruct(node) || isUnstruct(node)) {
    const propOffsets = offsetsForProps(node);
    const sortedProps = Object.entries(propOffsets).sort(
      (a, b) => a[1].offset - b[1].offset,
    );
    let code = '';
    for (const [key, propOffset] of sortedProps) {
      const subSchema = node.propTypes[key];
      if (!subSchema) continue;
      code += buildWriter(
        subSchema,
        `(${offsetExpr} + ${propOffset.offset})`,
        `${valueExpr}.${key}`,
      );
    }
    return code;
  }

  if (wgsl.isWgslArray(node) || isDisarray(node)) {
    const arrSchema = node as wgsl.WgslArray;
    const elementSize = roundUp(
      sizeOf(arrSchema.elementType),
      alignmentOf(arrSchema.elementType),
    );
    let code = '';

    code += `for (let i = 0; i < ${arrSchema.elementCount}; i++) {\n`;
    code += buildWriter(
      arrSchema.elementType,
      `(${offsetExpr} + i * ${elementSize})`,
      `${valueExpr}[i]`,
    );
    code += '}\n';

    return code;
  }

  if (wgsl.isVec(node)) {
    const primitive = typeToPrimitive[node.type];
    let code = '';
    const writeFunc = primitiveToWriteFunction[primitive];
    const components = ['x', 'y', 'z', 'w'];
    const count = wgsl.isVec2(node) ? 2 : wgsl.isVec3(node) ? 3 : 4;

    for (let i = 0; i < count; i++) {
      code += `output.${writeFunc}((${offsetExpr} + ${i * 4}), ${valueExpr}.${components[i]}, endianness);\n`;
    }
    return code;
  }

  const primitive = typeToPrimitive[node.type as keyof typeof typeToPrimitive];
  return `output.${primitiveToWriteFunction[primitive]}(${offsetExpr}, ${valueExpr}, endianness);\n`;
}

export function getCompiledWriterForSchema<T extends wgsl.BaseData>(
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

  const body = buildWriter(schema, 'offset', 'value');

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

import { roundUp } from '../mathUtils.ts';
import type { Infer } from '../shared/repr.ts';
import { alignmentOf } from './alignmentOf.ts';
import { isDisarray, isUnstruct } from './dataTypes.ts';
import { offsetsForProps } from './offsets.ts';
import { sizeOf } from './sizeOf.ts';
import { formatToWGSLType, isPackedData } from './vertexFormatData.ts';
import * as wgsl from './wgslTypes.ts';

export const EVAL_ALLOWED_IN_ENV: boolean = (() => {
  try {
    // oxlint-disable-next-line typescript-eslint/no-implied-eval typescript-eslint/no-new
    new Function('return true');
    return true;
  } catch {
    return false;
  }
})();

const compiledWriters = new WeakMap<
  wgsl.BaseData,
  (
    output: DataView,
    offset: number,
    value: unknown,
    littleEndian?: boolean,
  ) => void
>();

const typeToPrimitive = {
  u32: 'u32',
  vec2u: 'u32',
  vec3u: 'u32',
  vec4u: 'u32',
  u16: 'u16',

  i32: 'i32',
  vec2i: 'i32',
  vec3i: 'i32',
  vec4i: 'i32',

  f32: 'f32',
  vec2f: 'f32',
  vec3f: 'f32',
  vec4f: 'f32',

  f16: 'f16',
  vec2h: 'f16',
  vec3h: 'f16',
  vec4h: 'f16',

  mat2x2f: 'f32',
  mat3x3f: 'f32',
  mat4x4f: 'f32',
} as const;

const vertexFormatToPrimitive = {
  uint8: 'u8',
  uint8x2: 'u8',
  uint8x4: 'u8',
  sint8: 'i8',
  sint8x2: 'i8',
  sint8x4: 'i8',
  unorm8: 'u8',
  unorm8x2: 'u8',
  unorm8x4: 'u8',
  snorm8: 'i8',
  snorm8x2: 'i8',
  snorm8x4: 'i8',
  uint16: 'u16',
  uint16x2: 'u16',
  uint16x4: 'u16',
  sint16: 'i16',
  sint16x2: 'i16',
  sint16x4: 'i16',
  unorm16: 'u16',
  unorm16x2: 'u16',
  unorm16x4: 'u16',
  snorm16: 'i16',
  snorm16x2: 'i16',
  snorm16x4: 'i16',
  float16: 'f16',
  float16x2: 'f16',
  float16x4: 'f16',
  float32: 'f32',
  float32x2: 'f32',
  float32x3: 'f32',
  float32x4: 'f32',
  uint32: 'u32',
  uint32x2: 'u32',
  uint32x3: 'u32',
  uint32x4: 'u32',
  sint32: 'i32',
  sint32x2: 'i32',
  sint32x3: 'i32',
  sint32x4: 'i32',
} as const;

const primitiveToWriteFunction = {
  u32: 'setUint32',
  i32: 'setInt32',
  f32: 'setFloat32',
  u16: 'setUint16',
  i16: 'setInt16',
  f16: 'setFloat16',
  u8: 'setUint8',
  i8: 'setInt8',
} as const;

/**
 * @privateRemarks
 * based on the `Channel Formats` table https://www.w3.org/TR/WGSL/#texel-formats
 */
const vertexFormatValueTransform = {
  unorm8: (value: string) => `Math.round(${value} * 255)`,
  unorm8x2: (value: string) => `Math.round(${value} * 255)`,
  unorm8x4: (value: string) => `Math.round(${value} * 255)`,
  snorm8: (value: string) => `Math.round(${value} * 127)`,
  snorm8x2: (value: string) => `Math.round(${value} * 127)`,
  snorm8x4: (value: string) => `Math.round(${value} * 127)`,
  unorm16: (value: string) => `Math.round(${value} * 65535)`,
  unorm16x2: (value: string) => `Math.round(${value} * 65535)`,
  unorm16x4: (value: string) => `Math.round(${value} * 65535)`,
  snorm16: (value: string) => `Math.round(${value} * 32767)`,
  snorm16x2: (value: string) => `Math.round(${value} * 32767)`,
  snorm16x4: (value: string) => `Math.round(${value} * 32767)`,
} as const;

const specialPackedFormats = {
  'unorm10-10-10-2': {
    writeFunction: 'setUint32',
    generator: (offsetExpr: string, valueExpr: string) =>
      `output.setUint32(${offsetExpr}, ((${valueExpr}.x*1023&0x3FF)<<22)|((${valueExpr}.y*1023&0x3FF)<<12)|((${valueExpr}.z*1023&0x3FF)<<2)|(${valueExpr}.w*3&3), littleEndian);\n`,
  },
  'unorm8x4-bgra': {
    writeFunction: 'setUint8',
    generator: (offsetExpr: string, valueExpr: string) => {
      const bgraComponents = ['z', 'y', 'x', 'w'];
      let code = '';
      for (let idx = 0; idx < 4; idx++) {
        code +=
          `output.setUint8((${offsetExpr} + ${idx}), Math.round(${valueExpr}.${
            bgraComponents[idx]
          } * 255), littleEndian);\n`;
      }
      return code;
    },
  },
} as const;

export function buildWriter(
  node: wgsl.BaseData,
  offsetExpr: string,
  valueExpr: string,
  depth = 0,
): string {
  const loopVar = ['i', 'j', 'k'][depth] || `i${depth}`;

  if (wgsl.isAtomic(node) || wgsl.isDecorated(node)) {
    return buildWriter(node.inner, offsetExpr, valueExpr, depth);
  }

  if (wgsl.isWgslStruct(node) || isUnstruct(node)) {
    const propOffsets = offsetsForProps(node);
    let code = '';
    for (const [key, propOffset] of Object.entries(propOffsets)) {
      const subSchema = node.propTypes[key];
      if (!subSchema) continue;
      code += buildWriter(
        subSchema,
        `(${offsetExpr} + ${propOffset.offset})`,
        `${valueExpr}.${key}`,
        depth,
      );
    }
    return code;
  }

  if (wgsl.isWgslArray(node) || isDisarray(node)) {
    const elementSize = roundUp(
      sizeOf(node.elementType),
      alignmentOf(node),
    );
    let code = '';

    code +=
      `for (let ${loopVar} = 0; ${loopVar} < ${node.elementCount}; ${loopVar}++) {\n`;
    code += buildWriter(
      node.elementType,
      `(${offsetExpr} + ${loopVar} * ${elementSize})`,
      `${valueExpr}[${loopVar}]`,
      depth + 1,
    );
    code += '}\n';

    return code;
  }

  if (wgsl.isVec(node)) {
    if (wgsl.isVecBool(node)) {
      throw new Error('Compiled writers do not support boolean vectors');
    }

    const primitive = typeToPrimitive[node.type];
    let code = '';
    const writeFunc = primitiveToWriteFunction[primitive];
    const components = ['x', 'y', 'z', 'w'];

    for (let i = 0; i < node.componentCount; i++) {
      code += `output.${writeFunc}((${offsetExpr} + ${i * 4}), ${valueExpr}.${
        components[i]
      }, littleEndian);\n`;
    }
    return code;
  }

  if (wgsl.isMat(node)) {
    const primitive = typeToPrimitive[node.type];
    const writeFunc = primitiveToWriteFunction[primitive];

    const matSize = wgsl.isMat2x2f(node) ? 2 : wgsl.isMat3x3f(node) ? 3 : 4;
    const elementCount = matSize * matSize;
    const rowStride = roundUp(matSize * 4, 8);

    let code = '';
    for (let idx = 0; idx < elementCount; idx++) {
      const colIndex = Math.floor(idx / matSize);
      const rowIndex = idx % matSize;
      const byteOffset = colIndex * rowStride + rowIndex * 4;

      code +=
        `output.${writeFunc}((${offsetExpr} + ${byteOffset}), ${valueExpr}.columns[${colIndex}].${
          ['x', 'y', 'z', 'w'][rowIndex]
        }, littleEndian);\n`;
    }

    return code;
  }

  if (isPackedData(node)) {
    const formatName = node.type;

    if (formatName in specialPackedFormats) {
      const handler =
        specialPackedFormats[formatName as keyof typeof specialPackedFormats];
      return handler.generator(offsetExpr, valueExpr);
    }

    const primitive = vertexFormatToPrimitive[
      formatName as keyof typeof vertexFormatToPrimitive
    ];
    const writeFunc = primitiveToWriteFunction[primitive];
    const wgslType = formatToWGSLType[formatName];
    const componentCount = wgsl.isVec(wgslType) ? wgslType.componentCount : 1;
    const componentSize = primitive === 'u8' || primitive === 'i8'
      ? 1
      : primitive === 'u16' || primitive === 'i16' || primitive === 'f16'
      ? 2
      : 4;
    const components = ['x', 'y', 'z', 'w'];
    const transform = vertexFormatValueTransform[
      formatName as keyof typeof vertexFormatValueTransform
    ];

    let code = '';
    for (let idx = 0; idx < componentCount; idx++) {
      const accessor = componentCount === 1
        ? valueExpr
        : `${valueExpr}.${components[idx]}`;
      const value = transform ? transform(accessor) : accessor;
      code += `output.${writeFunc}((${offsetExpr} + ${
        idx * componentSize
      }), ${value}, littleEndian);\n`;
    }

    return code;
  }

  if (!Object.hasOwn(typeToPrimitive, node.type)) {
    throw new Error(
      `Primitive ${node.type} is unsupported by compiled writer`,
    );
  }

  const primitive = typeToPrimitive[node.type as keyof typeof typeToPrimitive];
  return `output.${
    primitiveToWriteFunction[primitive]
  }(${offsetExpr}, ${valueExpr}, littleEndian);\n`;
}

export function getCompiledWriterForSchema<T extends wgsl.BaseData>(
  schema: T,
):
  | ((
    output: DataView,
    offset: number,
    value: Infer<T>,
    littleEndian?: boolean,
  ) => void)
  | undefined {
  if (!EVAL_ALLOWED_IN_ENV) {
    console.warn(
      'This environment does not allow eval - using default writer as fallback',
    );
    return undefined;
  }

  if (compiledWriters.has(schema)) {
    return compiledWriters.get(schema) as (
      output: DataView,
      offset: number,
      value: Infer<T>,
      littleEndian?: boolean,
    ) => void;
  }

  try {
    const body = buildWriter(schema, 'offset', 'value', 0);

    // oxlint-disable-next-line typescript-eslint/no-implied-eval
    const fn = new Function(
      'output',
      'offset',
      'value',
      'littleEndian=true',
      body,
    ) as (
      output: DataView,
      offset: number,
      value: unknown,
      littleEndian?: boolean,
    ) => void;

    compiledWriters.set(schema, fn);

    return fn;
  } catch (error) {
    console.warn(
      `Failed to compile writer for schema: ${schema}\nReason: ${
        error instanceof Error ? error.message : String(error)
      }\nFalling back to default writer`,
    );
  }
}

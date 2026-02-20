import { getAttributesString } from '../../data/attributes.ts';
import {
  type AnyData,
  type Disarray,
  isLooseData,
  type Unstruct,
} from '../../data/dataTypes.ts';
import { isWgslComparisonSampler, isWgslSampler } from '../../data/sampler.ts';
import {
  accessModeMap,
  isWgslStorageTexture,
  isWgslTexture,
  type WgslExternalTexture,
} from '../../data/texture.ts';

import { formatToWGSLType } from '../../data/vertexFormatData.ts';
import type {
  AnyWgslData,
  BaseData,
  Bool,
  F16,
  F32,
  I32,
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  U32,
  Vec2b,
  Vec2f,
  Vec2h,
  Vec2i,
  Vec2u,
  Vec3b,
  Vec3f,
  Vec3h,
  Vec3i,
  Vec3u,
  Vec4b,
  Vec4f,
  Vec4h,
  Vec4i,
  Vec4u,
  WgslArray,
  WgslStruct,
} from '../../data/wgslTypes.ts';
import { $internal } from '../../shared/symbols.ts';
import { assertExhaustive } from '../../shared/utilityTypes.ts';
import type { ResolutionCtx } from '../../types.ts';
import { isAttribute } from '../vertexLayout/connectAttributesToShader.ts';

/**
 * Schemas for which their `type` property directly
 * translates to the resulting WGSL code.
 */
const identityTypes = [
  'bool',
  'f32',
  'f16',
  'i32',
  'u32',
  'vec2f',
  'vec3f',
  'vec4f',
  'vec2h',
  'vec3h',
  'vec4h',
  'vec2i',
  'vec3i',
  'vec4i',
  'vec2u',
  'vec3u',
  'vec4u',
  'vec2<bool>',
  'vec3<bool>',
  'vec4<bool>',
  'mat2x2f',
  'mat3x3f',
  'mat4x4f',
  'texture_external',
];

type IdentityType =
  | Bool
  | F32
  | F16
  | I32
  | U32
  | Vec2f
  | Vec3f
  | Vec4f
  | Vec2h
  | Vec3h
  | Vec4h
  | Vec2i
  | Vec3i
  | Vec4i
  | Vec2u
  | Vec3u
  | Vec4u
  | Vec2b
  | Vec3b
  | Vec4b
  | Mat2x2f
  | Mat3x3f
  | Mat4x4f
  | WgslExternalTexture;

function isIdentityType(data: BaseData): data is IdentityType {
  return identityTypes.includes(data.type);
}

/**
 * Resolves a single property of a struct.
 * @param ctx - The resolution context.
 * @param key - The key of the property.
 * @param property - The property itself.
 *
 * @returns The resolved property string.
 */
function resolveStructProperty(
  ctx: ResolutionCtx,
  [key, property]: [string, BaseData],
) {
  return `  ${getAttributesString(property)}${key}: ${
    ctx.resolve(property).value
  },\n`;
}

/**
 * Resolves a struct and adds its declaration to the resolution context.
 * @param ctx - The resolution context.
 * @param struct - The struct to resolve.
 *
 * @returns The resolved struct name.
 */
function resolveStruct(ctx: ResolutionCtx, struct: WgslStruct) {
  if (struct[$internal].isAbstruct) {
    throw new Error('Cannot resolve abstract struct types to WGSL.');
  }
  const id = ctx.getUniqueName(struct);

  ctx.addDeclaration(`\
struct ${id} {
${
    Object.entries(struct.propTypes)
      .map((prop) => resolveStructProperty(ctx, prop))
      .join('')
  }\
}`);

  return id;
}

/**
 * Resolves an unstruct (struct that does not align data by default) to its struct data counterpart.
 * @param ctx - The resolution context.
 * @param unstruct - The unstruct to resolve.
 *
 * @returns The resolved unstruct name.
 *
 * @example
 * ```ts
 * resolveUnstruct(ctx, {
 *   uv: d.float16x2, // -> d.vec2f after resolution
 *   color: d.snorm8x4, -> d.vec4f after resolution
 * });
 * ```
 */
function resolveUnstruct(ctx: ResolutionCtx, unstruct: Unstruct) {
  const id = ctx.getUniqueName(unstruct);

  ctx.addDeclaration(`\
struct ${id} {
${
    Object.entries(unstruct.propTypes)
      .map((prop) =>
        isAttribute(prop[1])
          ? resolveStructProperty(ctx, [
            prop[0],
            formatToWGSLType[prop[1].format],
          ])
          : resolveStructProperty(ctx, prop)
      )
      .join('')
  }
}`);

  return id;
}

/**
 * Resolves an array.
 * @param ctx - The resolution context.
 * @param array - The array to resolve.
 *
 * @returns The resolved array name along with its element type and count (if not runtime-sized).
 *
 * @example
 * ```ts
 * resolveArray(ctx, d.arrayOf(d.u32, 0)); // 'array<u32>' (not a real pattern, a function is preferred)
 * resolveArray(ctx, d.arrayOf(d.u32, 5)); // 'array<u32, 5>'
 * ```
 */
function resolveArray(ctx: ResolutionCtx, array: WgslArray) {
  const element = ctx.resolve(array.elementType as AnyWgslData).value;

  return array.elementCount === 0
    ? `array<${element}>`
    : `array<${element}, ${array.elementCount}>`;
}

function resolveDisarray(ctx: ResolutionCtx, disarray: Disarray) {
  const element = ctx.resolve(
    isAttribute(disarray.elementType)
      ? formatToWGSLType[disarray.elementType.format]
      : (disarray.elementType as AnyWgslData),
  ).value;

  return disarray.elementCount === 0
    ? `array<${element}>`
    : `array<${element}, ${disarray.elementCount}>`;
}

/**
 * Resolves a WGSL data-type schema to a string.
 * @param ctx - The resolution context.
 * @param data - The data-type to resolve.
 *
 * @returns The resolved data-type string.
 */
export function resolveData(ctx: ResolutionCtx, data: AnyData): string {
  if (isLooseData(data)) {
    if (data.type === 'unstruct') {
      return resolveUnstruct(ctx, data);
    }

    if (data.type === 'disarray') {
      return resolveDisarray(ctx, data);
    }

    if (data.type === 'loose-decorated') {
      return ctx.resolve(
        isAttribute(data.inner)
          ? formatToWGSLType[data.inner.format]
          : data.inner,
      ).value;
    }

    return ctx.resolve(formatToWGSLType[data.type]).value;
  }

  if (isIdentityType(data)) {
    return data.type;
  }

  if (data.type === 'struct') {
    return resolveStruct(ctx, data);
  }

  if (data.type === 'array') {
    return resolveArray(ctx, data);
  }

  if (data.type === 'atomic') {
    return `atomic<${resolveData(ctx, data.inner)}>`;
  }

  if (data.type === 'decorated') {
    return ctx.resolve(data.inner as AnyWgslData).value;
  }

  if (data.type === 'ptr') {
    if (data.addressSpace === 'storage') {
      return `ptr<storage, ${ctx.resolve(data.inner).value}, ${
        data.access === 'read-write' ? 'read_write' : data.access
      }>`;
    }
    return `ptr<${data.addressSpace}, ${ctx.resolve(data.inner).value}>`;
  }

  if (
    data.type === 'abstractInt' ||
    data.type === 'abstractFloat' ||
    data.type === 'void' ||
    data.type === 'u16'
  ) {
    throw new Error(`${data.type} has no representation in WGSL`);
  }

  if (isWgslStorageTexture(data)) {
    return `${data.type}<${data.format}, ${accessModeMap[data.access]}>`;
  }

  if (isWgslTexture(data)) {
    return data.type.startsWith('texture_depth')
      ? data.type
      : `${data.type}<${data.sampleType.type}>`;
  }

  if (isWgslComparisonSampler(data) || isWgslSampler(data)) {
    return data.type;
  }

  assertExhaustive(data, 'resolveData');
}

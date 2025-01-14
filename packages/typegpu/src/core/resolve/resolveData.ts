import { type Unstruct, formatToWGSLType } from '../../data';
import { getAttributesString } from '../../data/attributes';
import type {
  AnyWgslData,
  BaseWgslData,
  Bool,
  F16,
  F32,
  I32,
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  U32,
  Vec2f,
  Vec2h,
  Vec2i,
  Vec2u,
  Vec3f,
  Vec3h,
  Vec3i,
  Vec3u,
  Vec4f,
  Vec4h,
  Vec4i,
  Vec4u,
  WgslArray,
  WgslStruct,
} from '../../data/wgslTypes';
import { assertExhaustive } from '../../shared/utilityTypes';
import type { ResolutionCtx } from '../../types';
import { isAttribute } from '../vertexLayout/connectAttributesToShader';

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
  'mat2x2f',
  'mat3x3f',
  'mat4x4f',
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
  | Mat2x2f
  | Mat3x3f
  | Mat4x4f;

function isIdentityType(data: AnyWgslData): data is IdentityType {
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
  [key, property]: [string, BaseWgslData],
) {
  return `  ${getAttributesString(property)}${key}: ${ctx.resolve(property as AnyWgslData)},\n`;
}

/**
 * Resolves a struct and adds its declaration to the resolution context.
 * @param ctx - The resolution context.
 * @param struct - The struct to resolve.
 *
 * @returns The resolved struct name.
 */
function resolveStruct(ctx: ResolutionCtx, struct: WgslStruct) {
  const id = ctx.names.makeUnique(struct.label);

  ctx.addDeclaration(`
struct ${id} {
${Object.entries(struct.propTypes)
  .map((prop) => resolveStructProperty(ctx, prop))
  .join('')}\
}\n`);

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
  const id = ctx.names.makeUnique(unstruct.label);

  ctx.addDeclaration(`
struct ${id} {
${Object.entries(unstruct.propTypes)
  .map((prop) =>
    isAttribute(prop[1])
      ? resolveStructProperty(ctx, [prop[0], formatToWGSLType[prop[1].format]])
      : resolveStructProperty(ctx, prop),
  )
  .join('')}\
}\n`);

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
  const element = ctx.resolve(array.elementType as AnyWgslData);

  return array.elementCount === 0
    ? `array<${element}>`
    : `array<${element}, ${array.elementCount}>`;
}

/**
 * Resolves a WGSL data-type schema to a string.
 * @param ctx - The resolution context.
 * @param data - The data-type to resolve.
 *
 * @returns The resolved data-type string.
 */
export function resolveData(
  ctx: ResolutionCtx,
  data: AnyWgslData | Unstruct,
): string {
  if (data.type === 'unstruct') {
    return resolveUnstruct(ctx, data);
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
    return ctx.resolve(data.inner as AnyWgslData);
  }

  assertExhaustive(data, 'resolveData');
}

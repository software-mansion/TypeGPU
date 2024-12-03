import { getAttributesString } from '../../data/attributes';
import type {
  AnyWgslData,
  Bool,
  F32,
  I32,
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  U32,
  Vec2f,
  Vec2i,
  Vec2u,
  Vec3f,
  Vec3i,
  Vec3u,
  Vec4f,
  Vec4i,
  Vec4u,
  WgslArray,
  WgslStruct,
} from '../../data/wgslTypes';
import { assertExhaustive } from '../../shared/utilityTypes';
import type { ResolutionCtx } from '../../types';

const identityTypes = [
  'bool',
  'f32',
  'i32',
  'u32',
  'vec2f',
  'vec3f',
  'vec4f',
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
  | I32
  | U32
  | Vec2f
  | Vec3f
  | Vec4f
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

function resolveStruct(ctx: ResolutionCtx, struct: WgslStruct) {
  const id = ctx.names.makeUnique(struct.label);

  ctx.addDeclaration(`
struct ${id} {
${Object.entries(struct.propTypes)
  .map(
    ([key, field]) =>
      `  ${getAttributesString(field)}${key}: ${ctx.resolve(field as AnyWgslData)},\n`,
  )
  .join('')}\
}\n`);

  return id;
}

function resolveArray(ctx: ResolutionCtx, array: WgslArray) {
  const element = ctx.resolve(array.elementType as AnyWgslData);

  return array.length === 0
    ? `array<${element}>`
    : `array<${element}, ${array.length}>`;
}

export function resolveData(ctx: ResolutionCtx, data: AnyWgslData): string {
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

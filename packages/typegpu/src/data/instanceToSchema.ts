import { $internal } from '../shared/symbols.ts';
import type {
  Bool,
  F16,
  F32,
  I32,
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  U16,
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
  Void,
} from './wgslTypes.ts';

type KindToSchemaMap = {
  vec2f: Vec2f;
  vec3f: Vec3f;
  vec4f: Vec4f;
  vec2h: Vec2h;
  vec3h: Vec3h;
  vec4h: Vec4h;
  vec2i: Vec2i;
  vec3i: Vec3i;
  vec4i: Vec4i;
  vec2u: Vec2u;
  vec3u: Vec3u;
  vec4u: Vec4u;
  'vec2<bool>': Vec2b;
  'vec3<bool>': Vec3b;
  'vec4<bool>': Vec4b;
  mat2x2f: Mat2x2f;
  mat3x3f: Mat3x3f;
  mat4x4f: Mat4x4f;
};

/**
 * Inverse operation to d.Infer<T>
 */
export type InstanceToSchema<T> = T extends number
  ? U32 | U16 | I32 | F32 | F16
  : T extends boolean
    ? Bool
    : T extends undefined
      ? Void
      : T extends {
            readonly [$internal]: unknown;
            readonly kind: infer TKind extends keyof KindToSchemaMap;
          }
        ? KindToSchemaMap[TKind]
        : // Leave it be
          T;

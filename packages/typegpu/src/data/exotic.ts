import type * as wgsl from './wgslTypes';

type TypeToPrimitiveMap = {
  bool: wgsl.Bool;
  f32: wgsl.F32;
  i32: wgsl.I32;
  u32: wgsl.U32;
  vec2f: wgsl.Vec2f;
  vec2i: wgsl.Vec2i;
  vec2u: wgsl.Vec2u;
  vec3f: wgsl.Vec3f;
  vec3i: wgsl.Vec3i;
  vec3u: wgsl.Vec3u;
  vec4f: wgsl.Vec4f;
  vec4i: wgsl.Vec4i;
  vec4u: wgsl.Vec4u;
  mat2x2f: wgsl.Mat2x2f;
  mat3x3f: wgsl.Mat3x3f;
  mat4x4f: wgsl.Mat4x4f;
};

/**
 * Strips schema types down to their most basic forms. (native -> exotic)
 * This is used by schema constructors to be able to ingest native schemas (created by TypeGPU), and
 * spit out a type that matches non-native schemas as well.
 */
export type Exotic<T> =
  // primitives
  T extends { type: keyof TypeToPrimitiveMap }
    ? TypeToPrimitiveMap[T['type']]
    : // arrays
      T extends wgsl.WgslArray<infer TElement>
      ? wgsl.WgslArray<TElement>
      : // structs
        T extends wgsl.WgslStruct<infer TProps>
        ? wgsl.WgslStruct<TProps>
        : // atomics
          T extends wgsl.Atomic<infer TInner>
          ? wgsl.Atomic<TInner>
          : // decorated
            T extends wgsl.Decorated<infer TInner, infer TAttribs>
            ? wgsl.Decorated<TInner, TAttribs>
            : T;

export type ExoticArray<T> = T extends unknown[] | []
  ? {
      [Key in keyof T]: Exotic<T[Key]>;
    }
  : T;

export type ExoticRecord<T> = T extends Record<
  string | number | symbol,
  unknown
>
  ? {
      [Key in keyof T]: Exotic<T[Key]>;
    }
  : T;

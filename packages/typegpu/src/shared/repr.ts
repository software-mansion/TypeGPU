import type * as wgsl from '../data/wgslTypes';

/**
 * Extracts the inferred representation of a resource.
 * @example
 * type A = Infer<TgpuBufferReadonly<F32>> // => number
 * type B = Infer<TgpuBufferReadonly<TgpuArray<F32>>> // => number[]
 */
export type Infer<T> = T extends { readonly __repr: infer TRepr } ? TRepr : T;

export type InferRecord<T extends Record<string | number | symbol, unknown>> = {
  [Key in keyof T]: Infer<T[Key]>;
};

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
};

export type Exotic<T> = T extends { type: keyof TypeToPrimitiveMap }
  ? TypeToPrimitiveMap[T['type']]
  : T extends wgsl.WgslArray<infer TElement>
    ? wgsl.WgslArray<TElement>
    : T extends wgsl.WgslStruct<infer TProps>
      ? wgsl.WgslStruct<TProps>
      : T;

export type ExoticRecord<T> = T extends Record<
  string | number | symbol,
  unknown
>
  ? {
      [Key in keyof T]: Exotic<T[Key]>;
    }
  : T;

import {
  type Decorated,
  type F32,
  type TgpuArray,
  type U32,
  type Vec3u,
  type Vec4f,
  arrayOf,
  f32,
  u32,
  vec3u,
  vec4f,
} from './data';
import { type Builtin, type IsBuiltin, attribute } from './data/attributes';

// ----------
// Public API
// ----------

export type BuiltinVertexIndex = Decorated<U32, [Builtin<'vertex_index'>]>;
export type BuiltinInstanceIndex = Decorated<U32, [Builtin<'instance_index'>]>;
export type BuiltinPosition = Decorated<Vec4f, [Builtin<'position'>]>;
export type BuiltinClipDistances = Decorated<
  TgpuArray<U32>,
  [Builtin<'clip_distances'>]
>;
export type BuiltinFrontFacing = Decorated<F32, [Builtin<'front_facing'>]>;
export type BuiltinFragDepth = Decorated<F32, [Builtin<'frag_depth'>]>;
export type BuiltinSampleIndex = Decorated<U32, [Builtin<'sample_index'>]>;
export type BuiltinSampleMask = Decorated<U32, [Builtin<'sample_mask'>]>;
export type BuiltinFragment = Decorated<Vec4f, [Builtin<'fragment'>]>;
export type BuiltinLocalInvocationId = Decorated<
  Vec3u,
  [Builtin<'local_invocation_id'>]
>;
export type BuiltinLocalInvocationIndex = Decorated<
  U32,
  [Builtin<'local_invocation_index'>]
>;
export type BuiltinGlobalInvocationId = Decorated<
  Vec3u,
  [Builtin<'global_invocation_id'>]
>;
export type BuiltinWorkgroupId = Decorated<Vec3u, [Builtin<'workgroup_id'>]>;
export type BuiltinNumWorkgroups = Decorated<
  Vec3u,
  [Builtin<'num_workgroups'>]
>;

export const builtin = {
  vertexIndex: attribute(u32, {
    type: 'builtin',
    name: 'vertex_index',
  }) as BuiltinVertexIndex,
  instanceIndex: attribute(u32, {
    type: 'builtin',
    name: 'instance_index',
  }) as BuiltinInstanceIndex,
  position: attribute(vec4f, {
    type: 'builtin',
    name: 'position',
  }) as BuiltinPosition,
  clipDistances: attribute(arrayOf(u32, 8), {
    type: 'builtin',
    name: 'clip_distances',
  }) as BuiltinClipDistances,
  frontFacing: attribute(f32, {
    type: 'builtin',
    name: 'front_facing',
  }) as BuiltinFrontFacing,
  fragDepth: attribute(f32, {
    type: 'builtin',
    name: 'frag_depth',
  }) as BuiltinFragDepth,
  sampleIndex: attribute(u32, {
    type: 'builtin',
    name: 'sample_index',
  }) as BuiltinSampleIndex,
  sampleMask: attribute(u32, {
    type: 'builtin',
    name: 'sample_mask',
  }) as BuiltinSampleMask,
  localInvocationId: attribute(vec3u, {
    type: 'builtin',
    name: 'local_invocation_id',
  }) as BuiltinLocalInvocationId,
  localInvocationIndex: attribute(u32, {
    type: 'builtin',
    name: 'local_invocation_index',
  }) as BuiltinLocalInvocationIndex,
  globalInvocationId: attribute(vec3u, {
    type: 'builtin',
    name: 'global_invocation_id',
  }) as BuiltinGlobalInvocationId,
  workgroupId: attribute(vec3u, {
    type: 'builtin',
    name: 'workgroup_id',
  }) as BuiltinWorkgroupId,
  numWorkgroups: attribute(vec3u, {
    type: 'builtin',
    name: 'num_workgroups',
  }) as BuiltinNumWorkgroups,
} as const;

export type AnyBuiltin = (typeof builtin)[keyof typeof builtin];

export type OmitBuiltins<S extends object> = {
  [Key in keyof S as IsBuiltin<S[Key]> extends true ? never : Key]: S[Key];
};

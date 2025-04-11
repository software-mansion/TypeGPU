import { arrayOf } from './data/array.ts';
import { attribute } from './data/attributes.ts';
import { f32, u32 } from './data/numeric.ts';
import { vec3u, vec4f } from './data/vector.ts';
import type {
  BaseData,
  Builtin,
  Decorated,
  F32,
  U32,
  Vec3u,
  Vec4f,
  WgslArray,
} from './data/wgslTypes.ts';

// ----------
// Public API
// ----------

export type BuiltinVertexIndex = Decorated<U32, [Builtin<'vertex_index'>]>;
export type BuiltinInstanceIndex = Decorated<U32, [Builtin<'instance_index'>]>;
export type BuiltinPosition = Decorated<Vec4f, [Builtin<'position'>]>;
export type BuiltinClipDistances = Decorated<
  WgslArray<U32>,
  [Builtin<'clip_distances'>]
>;
export type BuiltinFrontFacing = Decorated<F32, [Builtin<'front_facing'>]>;
export type BuiltinFragDepth = Decorated<F32, [Builtin<'frag_depth'>]>;
export type BuiltinSampleIndex = Decorated<U32, [Builtin<'sample_index'>]>;
export type BuiltinSampleMask = Decorated<U32, [Builtin<'sample_mask'>]>;
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
export type BuiltinSubgroupInvocationId = Decorated<
  U32,
  [Builtin<'subgroup_invocation_id'>]
>;
export type BuiltinSubgroupSize = Decorated<U32, [Builtin<'subgroup_size'>]>;

export const builtin = {
  vertexIndex: attribute(u32, {
    type: '@builtin',
    value: 'vertex_index',
  }) as BuiltinVertexIndex,
  instanceIndex: attribute(u32, {
    type: '@builtin',
    value: 'instance_index',
  }) as BuiltinInstanceIndex,
  position: attribute(vec4f, {
    type: '@builtin',
    value: 'position',
  }) as BuiltinPosition,
  clipDistances: attribute(arrayOf(u32, 8), {
    type: '@builtin',
    value: 'clip_distances',
  }) as BuiltinClipDistances,
  frontFacing: attribute(f32, {
    type: '@builtin',
    value: 'front_facing',
  }) as BuiltinFrontFacing,
  fragDepth: attribute(f32, {
    type: '@builtin',
    value: 'frag_depth',
  }) as BuiltinFragDepth,
  sampleIndex: attribute(u32, {
    type: '@builtin',
    value: 'sample_index',
  }) as BuiltinSampleIndex,
  sampleMask: attribute(u32, {
    type: '@builtin',
    value: 'sample_mask',
  }) as BuiltinSampleMask,
  localInvocationId: attribute(vec3u, {
    type: '@builtin',
    value: 'local_invocation_id',
  }) as BuiltinLocalInvocationId,
  localInvocationIndex: attribute(u32, {
    type: '@builtin',
    value: 'local_invocation_index',
  }) as BuiltinLocalInvocationIndex,
  globalInvocationId: attribute(vec3u, {
    type: '@builtin',
    value: 'global_invocation_id',
  }) as BuiltinGlobalInvocationId,
  workgroupId: attribute(vec3u, {
    type: '@builtin',
    value: 'workgroup_id',
  }) as BuiltinWorkgroupId,
  numWorkgroups: attribute(vec3u, {
    type: '@builtin',
    value: 'num_workgroups',
  }) as BuiltinNumWorkgroups,
  subgroupInvocationId: attribute(u32, {
    type: '@builtin',
    value: 'subgroup_invocation_id',
  }) as BuiltinSubgroupInvocationId,
  subgroupSize: attribute(u32, {
    type: '@builtin',
    value: 'subgroup_size',
  }) as BuiltinSubgroupSize,
} as const;

export type AnyBuiltin = (typeof builtin)[keyof typeof builtin];
export type AnyComputeBuiltin =
  | BuiltinLocalInvocationId
  | BuiltinLocalInvocationIndex
  | BuiltinGlobalInvocationId
  | BuiltinWorkgroupId
  | BuiltinNumWorkgroups
  | BuiltinSubgroupInvocationId
  | BuiltinSubgroupSize;
export type AnyVertexInputBuiltin = BuiltinVertexIndex | BuiltinInstanceIndex;
export type AnyVertexOutputBuiltin = BuiltinClipDistances | BuiltinPosition;
export type AnyFragmentInputBuiltin =
  | BuiltinPosition
  | BuiltinFrontFacing
  | BuiltinSampleIndex
  | BuiltinSampleMask
  | BuiltinSubgroupInvocationId
  | BuiltinSubgroupSize;
export type AnyFragmentOutputBuiltin = BuiltinFragDepth | BuiltinSampleMask;

export type OmitBuiltins<S> = S extends AnyBuiltin
  ? never
  : S extends BaseData
    ? S
    : {
        [Key in keyof S as S[Key] extends AnyBuiltin ? never : Key]: S[Key];
      };

import { arrayOf } from './data/array.ts';
import { attribute } from './data/attributes.ts';
import type { LooseDecorated } from './data/dataTypes.ts';
import { bool, f32, u32 } from './data/numeric.ts';
import { vec3u, vec4f } from './data/vector.ts';
import type {
  BaseData,
  Bool,
  Builtin,
  Decorated,
  F32,
  U32,
  Vec3u,
  Vec4f,
  WgslArray,
} from './data/wgslTypes.ts';
import { $internal } from './shared/symbols.ts';

// ----------
// Public API
// ----------

export type BuiltinVertexIndex = Decorated<U32, [Builtin<'vertex_index'>]>;
export type BuiltinInstanceIndex = Decorated<U32, [Builtin<'instance_index'>]>;
export type BuiltinClipDistances = Decorated<
  WgslArray<U32>,
  [Builtin<'clip_distances'>]
>;
export type BuiltinPosition = Decorated<Vec4f, [Builtin<'position'>]>;
export type BuiltinFrontFacing = Decorated<Bool, [Builtin<'front_facing'>]>;
export type BuiltinFragDepth = Decorated<F32, [Builtin<'frag_depth'>]>;
export type BuiltinPrimitiveIndex = Decorated<
  U32,
  [Builtin<'primitive_index'>]
>;
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
export type BuiltinSubgroupId = Decorated<U32, [Builtin<'subgroup_id'>]>;
export type BuiltinNumSubgroups = Decorated<U32, [Builtin<'num_subgroups'>]>;

function defineBuiltin<T extends Decorated | LooseDecorated>(
  dataType: BaseData,
  value: T['attribs'][0] extends { params: [infer TValue] } ? TValue : never,
): T {
  return attribute(dataType, {
    [$internal]: true,
    type: '@builtin',
    // oxlint-disable-next-line typescript/no-explicit-any -- it's fine
    params: [value as any],
  }) as T;
}

export const builtin = {
  vertexIndex: defineBuiltin<BuiltinVertexIndex>(u32, 'vertex_index'),
  instanceIndex: defineBuiltin<BuiltinInstanceIndex>(u32, 'instance_index'),
  clipDistances: defineBuiltin<BuiltinClipDistances>(
    arrayOf(u32, 8),
    'clip_distances',
  ),
  position: defineBuiltin<BuiltinPosition>(vec4f, 'position'),
  frontFacing: defineBuiltin<BuiltinFrontFacing>(bool, 'front_facing'),
  fragDepth: defineBuiltin<BuiltinFragDepth>(f32, 'frag_depth'),
  primitiveIndex: defineBuiltin<BuiltinPrimitiveIndex>(u32, 'primitive_index'),
  sampleIndex: defineBuiltin<BuiltinSampleIndex>(u32, 'sample_index'),
  sampleMask: defineBuiltin<BuiltinSampleMask>(u32, 'sample_mask'),
  localInvocationId: defineBuiltin<BuiltinLocalInvocationId>(
    vec3u,
    'local_invocation_id',
  ),
  localInvocationIndex: defineBuiltin<BuiltinLocalInvocationIndex>(
    u32,
    'local_invocation_index',
  ),
  globalInvocationId: defineBuiltin<BuiltinGlobalInvocationId>(
    vec3u,
    'global_invocation_id',
  ),
  workgroupId: defineBuiltin<BuiltinWorkgroupId>(vec3u, 'workgroup_id'),
  numWorkgroups: defineBuiltin<BuiltinNumWorkgroups>(vec3u, 'num_workgroups'),
  subgroupInvocationId: defineBuiltin<BuiltinSubgroupInvocationId>(
    u32,
    'subgroup_invocation_id',
  ),
  subgroupSize: defineBuiltin<BuiltinSubgroupSize>(u32, 'subgroup_size'),
  subgroupId: defineBuiltin<BuiltinSubgroupId>(u32, 'subgroup_id'),
  numSubgroups: defineBuiltin<BuiltinNumSubgroups>(u32, 'num_subgroups'),
} as const;

export type AnyBuiltin = (typeof builtin)[keyof typeof builtin];
export type AnyComputeBuiltin =
  | BuiltinLocalInvocationId
  | BuiltinLocalInvocationIndex
  | BuiltinGlobalInvocationId
  | BuiltinWorkgroupId
  | BuiltinNumWorkgroups
  | BuiltinSubgroupInvocationId
  | BuiltinSubgroupSize
  | BuiltinSubgroupId
  | BuiltinNumSubgroups;
export type AnyVertexInputBuiltin = BuiltinVertexIndex | BuiltinInstanceIndex;
export type AnyVertexOutputBuiltin = BuiltinClipDistances | BuiltinPosition;
export type AnyFragmentInputBuiltin =
  | BuiltinPosition
  | BuiltinFrontFacing
  | BuiltinPrimitiveIndex
  | BuiltinSampleIndex
  | BuiltinSampleMask
  | BuiltinSubgroupInvocationId
  | BuiltinSubgroupSize;
export type AnyFragmentOutputBuiltin = BuiltinFragDepth | BuiltinSampleMask;

export type OmitBuiltins<S> = S extends AnyBuiltin ? never
  : S extends BaseData ? S
  : {
    [
      Key in keyof S as S[Key] extends AnyBuiltin ? never
        : Key extends `$${string}` ? never
        : Key
    ]: S[Key];
  };

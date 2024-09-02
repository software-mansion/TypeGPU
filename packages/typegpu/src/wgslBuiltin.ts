import * as TB from 'typed-binary';
import type { F32, U32, Vec3u, Vec4f } from './data';
import { SimpleTgpuData, f32, u32, vec3u, vec4f } from './data';
import type { TgpuData } from './types';
import { TgpuIdentifier } from './wgslIdentifier';

export type BuiltInPossibleTypes =
  | U32
  | F32
  | Vec3u
  | Vec4f
  | TgpuData<TB.Unwrap<U32>[]>;

export const builtin = {
  vertexIndex: Symbol('builtin_vertexIndex'),
  instanceIndex: Symbol('builtin_instanceIndex'),
  position: Symbol('builtin_position'),
  clipDistances: Symbol('builtin_clipDistances'),
  frontFacing: Symbol('builtin_frontFacing'),
  fragDepth: Symbol('builtin_fragDepth'),
  sampleIndex: Symbol('builtin_sampleIndex'),
  sampleMask: Symbol('builtin_sampleMask'),
  fragment: Symbol('builtin_fragment'),
  localInvocationId: Symbol('builtin_localInvocationId'),
  localInvocationIndex: Symbol('builtin_localInvocationIndex'),
  globalInvocationId: Symbol('builtin_globalInvocationId'),
  workgroupId: Symbol('builtin_workgroupId'),
  numWorkgroups: Symbol('builtin_numWorkgroups'),
} as const;

export interface Builtin {
  name: string;
  stage: 'vertex' | 'fragment' | 'compute';
  direction: 'input' | 'output';
  type: BuiltInPossibleTypes;
  identifier: TgpuIdentifier;
}

const builtinSymbolToObj: Record<symbol, Builtin> = {
  [builtin.vertexIndex]: {
    name: 'vertex_index',
    stage: 'vertex',
    direction: 'input',
    type: u32,
    identifier: new TgpuIdentifier().$name('vertex_index'),
  },
  [builtin.instanceIndex]: {
    name: 'instance_index',
    stage: 'vertex',
    direction: 'input',
    type: u32,
    identifier: new TgpuIdentifier().$name('instance_index'),
  },
  [builtin.position]: {
    name: 'position',
    stage: 'vertex',
    direction: 'output',
    type: vec4f,
    identifier: new TgpuIdentifier().$name('position'),
  },
  [builtin.clipDistances]: {
    name: 'clip_distances',
    stage: 'vertex',
    direction: 'output',
    type: new SimpleTgpuData({
      schema: TB.arrayOf(u32, 8),
      byteAlignment: 16,
      code: 'array<u32, 8>',
    }),
    identifier: new TgpuIdentifier().$name('clip_distances'),
  },
  [builtin.frontFacing]: {
    name: 'front_facing',
    stage: 'fragment',
    direction: 'input',
    type: f32,
    identifier: new TgpuIdentifier().$name('front_facing'),
  },
  [builtin.fragDepth]: {
    name: 'frag_depth',
    stage: 'fragment',
    direction: 'output',
    type: f32,
    identifier: new TgpuIdentifier().$name('frag_depth'),
  },
  [builtin.sampleIndex]: {
    name: 'sample_index',
    stage: 'fragment',
    direction: 'input',
    type: u32,
    identifier: new TgpuIdentifier().$name('sample_index'),
  },
  [builtin.sampleMask]: {
    name: 'sample_mask',
    stage: 'fragment',
    direction: 'input',
    type: u32,
    identifier: new TgpuIdentifier().$name('sample_mask'),
  },
  [builtin.fragment]: {
    name: 'fragment',
    stage: 'fragment',
    direction: 'input',
    type: vec4f,
    identifier: new TgpuIdentifier().$name('fragment'),
  },
  [builtin.localInvocationId]: {
    name: 'local_invocation_id',
    stage: 'compute',
    direction: 'input',
    type: vec3u,
    identifier: new TgpuIdentifier().$name('local_invocation_id'),
  },
  [builtin.localInvocationIndex]: {
    name: 'local_invocation_index',
    stage: 'compute',
    direction: 'input',
    type: u32,
    identifier: new TgpuIdentifier().$name('local_invocation_index'),
  },
  [builtin.globalInvocationId]: {
    name: 'global_invocation_id',
    stage: 'compute',
    direction: 'input',
    type: vec3u,
    identifier: new TgpuIdentifier().$name('global_invocation_id'),
  },
  [builtin.workgroupId]: {
    name: 'workgroup_id',
    stage: 'compute',
    direction: 'input',
    type: vec3u,
    identifier: new TgpuIdentifier().$name('workgroup_id'),
  },
  [builtin.numWorkgroups]: {
    name: 'num_workgroups',
    stage: 'compute',
    direction: 'input',
    type: vec3u,
    identifier: new TgpuIdentifier().$name('num_workgroups'),
  },
};

export function getBuiltinInfo(s: symbol): Builtin {
  const builtin = builtinSymbolToObj[s];
  if (!builtin) {
    throw new Error('Symbol is not a member of builtin');
  }
  return builtin;
}

export function getUsedBuiltinsNamed(
  o: Record<symbol, string>,
): { name: string; builtin: Builtin }[] {
  const res = Object.getOwnPropertySymbols(o).map((s) => {
    const builtin = builtinSymbolToObj[s];
    if (!builtin) {
      throw new Error('Symbol is not a member of builtin');
    }
    const name = o[s];
    if (!name) {
      throw new Error('Name is not provided');
    }
    return { name: name, builtin: builtin };
  });
  return res;
}

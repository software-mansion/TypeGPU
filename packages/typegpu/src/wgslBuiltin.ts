import { TgpuIdentifier } from './wgslIdentifier';

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
  symbol: symbol;
  name: string;
  stage: 'vertex' | 'fragment' | 'compute';
  direction: 'input' | 'output';
  identifier: TgpuIdentifier;
}

const builtinSymbolToObj: Record<symbol, Builtin> = {
  [builtin.vertexIndex]: {
    symbol: builtin.vertexIndex,
    name: 'vertex_index',
    stage: 'vertex',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('vertex_index'),
  },
  [builtin.instanceIndex]: {
    symbol: builtin.instanceIndex,
    name: 'instance_index',
    stage: 'vertex',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('instance_index'),
  },
  [builtin.position]: {
    symbol: builtin.position,
    name: 'position',
    stage: 'vertex',
    direction: 'output',
    identifier: new TgpuIdentifier().$name('position'),
  },
  [builtin.clipDistances]: {
    symbol: builtin.clipDistances,
    name: 'clip_distances',
    stage: 'vertex',
    direction: 'output',
    identifier: new TgpuIdentifier().$name('clip_distances'),
  },
  [builtin.frontFacing]: {
    symbol: builtin.frontFacing,
    name: 'front_facing',
    stage: 'fragment',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('front_facing'),
  },
  [builtin.fragDepth]: {
    symbol: builtin.fragDepth,
    name: 'frag_depth',
    stage: 'fragment',
    direction: 'output',
    identifier: new TgpuIdentifier().$name('frag_depth'),
  },
  [builtin.sampleIndex]: {
    symbol: builtin.sampleIndex,
    name: 'sample_index',
    stage: 'fragment',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('sample_index'),
  },
  [builtin.sampleMask]: {
    symbol: builtin.sampleMask,
    name: 'sample_mask',
    stage: 'fragment',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('sample_mask'),
  },
  [builtin.fragment]: {
    symbol: builtin.fragment,
    name: 'fragment',
    stage: 'fragment',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('fragment'),
  },
  [builtin.localInvocationId]: {
    symbol: builtin.localInvocationId,
    name: 'local_invocation_id',
    stage: 'compute',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('local_invocation_id'),
  },
  [builtin.localInvocationIndex]: {
    symbol: builtin.localInvocationIndex,
    name: 'local_invocation_index',
    stage: 'compute',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('local_invocation_index'),
  },
  [builtin.globalInvocationId]: {
    symbol: builtin.globalInvocationId,
    name: 'global_invocation_id',
    stage: 'compute',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('global_invocation_id'),
  },
  [builtin.workgroupId]: {
    symbol: builtin.workgroupId,
    name: 'workgroup_id',
    stage: 'compute',
    direction: 'input',
    identifier: new TgpuIdentifier().$name('workgroup_id'),
  },
  [builtin.numWorkgroups]: {
    symbol: builtin.numWorkgroups,
    name: 'num_workgroups',
    stage: 'compute',
    direction: 'input',
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

export function getUsedBuiltins(o: Record<symbol, string>): symbol[] {
  const res = Object.getOwnPropertySymbols(o).map((s) => {
    if (!builtinSymbolToObj[s]) {
      throw new Error('Symbol is not a member of builtin');
    }
    return s;
  });

  return res;
}

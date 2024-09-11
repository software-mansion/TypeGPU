import { builtin } from './builtin';
import { identifier } from './tgpuIdentifier';
import type { TgpuIdentifier } from './types';

const builtinToName = {
  [builtin.vertexIndex]: 'vertex_index',
  [builtin.instanceIndex]: 'instance_index',
  [builtin.position]: 'position',
  [builtin.clipDistances]: 'clip_distances',
  [builtin.frontFacing]: 'front_facing',
  [builtin.fragDepth]: 'frag_depth',
  [builtin.sampleIndex]: 'sample_index',
  [builtin.sampleMask]: 'sample_mask',
  [builtin.fragment]: 'fragment',
  [builtin.localInvocationId]: 'local_invocation_id',
  [builtin.localInvocationIndex]: 'local_invocation_index',
  [builtin.globalInvocationId]: 'global_invocation_id',
  [builtin.workgroupId]: 'workgroup_id',
  [builtin.numWorkgroups]: 'num_workgroups',
};

const identifierMap = new Map<symbol, TgpuIdentifier>();

export function nameForBuiltin(key: symbol): string {
  const name = builtinToName[key];
  if (!name) {
    throw new Error(`The symbol ${String(key)} in not a valid 'builtin'`);
  }

  return name;
}

export function idForBuiltin(key: symbol) {
  let id = identifierMap.get(key);

  if (id === undefined) {
    id = identifier().$name(builtinToName[key]);
    identifierMap.set(key, id);
  }

  return id;
}

import type { vec3u, vec4f } from './data';
import { TgpuBuiltin } from './tgpuBuiltin';
import { identifier } from './tgpuIdentifier';
import type { TgpuIdentifier } from './types';

export type BuiltinVertexIndex = TgpuBuiltin & number;
export type BuiltinInstanceIndex = TgpuBuiltin & number;
export type BuiltinPosition = TgpuBuiltin & vec4f;
export type BuiltinClipDistances = TgpuBuiltin & number[];
export type BuiltinFrontFacing = TgpuBuiltin & boolean;
export type BuiltinFragDepth = TgpuBuiltin & number;
export type BuiltinSampleIndex = TgpuBuiltin & number;
export type BuiltinSampleMask = TgpuBuiltin & vec4f;
export type BuiltinFragment = TgpuBuiltin & vec4f;
export type BuiltinLocalInvocationId = TgpuBuiltin & vec3u;
export type BuiltinLocalInvocationIndex = TgpuBuiltin & number;
export type BuiltinGlobalInvocationId = TgpuBuiltin & vec3u;
export type BuiltinWorkgroupId = TgpuBuiltin & vec3u;
export type BuiltinNumWorkgroups = TgpuBuiltin & vec3u;

export const builtin = {
  vertexIndex: new TgpuBuiltin('vertex_index') as BuiltinVertexIndex,
  instanceIndex: new TgpuBuiltin('instance_index') as BuiltinInstanceIndex,
  position: new TgpuBuiltin('position') as BuiltinPosition,
  clipDistances: new TgpuBuiltin('clip_distances') as BuiltinClipDistances,
  frontFacing: new TgpuBuiltin('front_facing') as BuiltinFrontFacing,
  fragDepth: new TgpuBuiltin('frag_depth') as BuiltinFragDepth,
  sampleIndex: new TgpuBuiltin('sample_index') as BuiltinSampleIndex,
  sampleMask: new TgpuBuiltin('sample_mask') as BuiltinSampleMask,
  fragment: new TgpuBuiltin('fragment') as BuiltinFragment,
  localInvocationId: new TgpuBuiltin(
    'local_invocation_id',
  ) as BuiltinLocalInvocationId,
  localInvocationIndex: new TgpuBuiltin(
    'local_invocation_index',
  ) as BuiltinLocalInvocationIndex,
  globalInvocationId: new TgpuBuiltin(
    'global_invocation_id',
  ) as BuiltinGlobalInvocationId,
  workgroupId: new TgpuBuiltin('workgroup_id') as BuiltinWorkgroupId,
  numWorkgroups: new TgpuBuiltin('num_workgroups') as BuiltinNumWorkgroups,
} as const;

const builtins = Object.values(builtin);

type Builtin = (typeof builtin)[keyof typeof builtin];

const symbolToBuiltin = new Map(
  builtins.map((builtin) => [builtin.s, builtin]),
);

export function getUsedBuiltinsNamed(
  o: Record<symbol, string>,
): { name: string; s: symbol }[] {
  const res = Object.getOwnPropertySymbols(o).map((s) => {
    const builtin = symbolToBuiltin.get(s);
    if (builtin === undefined) {
      throw new Error('Symbol is not a member of `builtin`');
    }
    const name = o[s] as string;
    return { name, s };
  });

  return res;
}

export function getUsedBuiltins(o: Record<symbol, string>): symbol[] {
  const res = Object.getOwnPropertySymbols(o).map((s) => {
    const builtin = symbolToBuiltin.get(s);
    if (builtin === undefined) {
      throw new Error('Symbol is not a member of `builtin`');
    }
    return s;
  });

  return res;
}

const identifierMap = new Map<symbol, TgpuIdentifier>();

export function nameForBuiltin(key: symbol): string {
  const name = symbolToBuiltin.get(key)?.name;
  if (!name) {
    throw new Error(`The symbol ${String(key)} in not a valid 'builtin'`);
  }

  return name;
}

export function idForBuiltin(key: symbol) {
  let id = identifierMap.get(key);

  if (id === undefined) {
    id = identifier().$name(symbolToBuiltin.get(key)?.name);
    identifierMap.set(key, id);
  }

  return id;
}

export type OmitBuiltins<S extends object> = {
  [Key in keyof S as S[Key] extends Builtin ? never : Key]: S[Key];
};

import { identifier } from './tgpuIdentifier';
import type { TgpuIdentifier } from './types';

export const builtinNames = [
  'vertex_index',
  'instance_index',
  'position',
  'clip_distances',
  'front_facing',
  'frag_depth',
  'sample_index',
  'sample_mask',
  'fragment',
  'local_invocation_id',
  'local_invocation_index',
  'global_invocation_id',
  'workgroup_id',
  'num_workgroups',
] as const;

export type BuiltinName = (typeof builtinNames)[number];

export const builtinSymbolToName = new Map(
  builtinNames.map((name) => [Symbol(name), name]),
);

export const builtinNameToSymbol = new Map(
  Array.from(builtinSymbolToName).map(([s, n]) => [n, s]),
);

const identifierMap = new Map<symbol, TgpuIdentifier>();

export function nameForBuiltin(key: symbol): string {
  const name = builtinSymbolToName.get(key);
  if (!name) {
    throw new Error(`The symbol ${String(key)} in not a valid 'builtin'`);
  }

  return name;
}

export function idForBuiltin(key: symbol) {
  let id = identifierMap.get(key);

  if (id === undefined) {
    id = identifier().$name(builtinSymbolToName.get(key));
    identifierMap.set(key, id);
  }

  return id;
}

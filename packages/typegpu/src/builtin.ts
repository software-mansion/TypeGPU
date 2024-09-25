import type { vec3u, vec4f } from './data';

export type BuiltinVertexIndex = symbol & number;
export type BuiltinInstanceIndex = symbol & number;
export type BuiltinPosition = symbol & vec4f;
export type BuiltinClipDistances = symbol & number[];
export type BuiltinFrontFacing = symbol & boolean;
export type BuiltinFragDepth = symbol & number;
export type BuiltinSampleIndex = symbol & number;
export type BuiltinSampleMask = symbol & vec4f;
export type BuiltinFragment = symbol & vec4f;
export type BuiltinLocalInvocationId = symbol & vec3u;
export type BuiltinLocalInvocationIndex = symbol & number;
export type BuiltinGlobalInvocationId = symbol & vec3u;
export type BuiltinWorkgroupId = symbol & vec3u;
export type BuiltinNumWorkgroups = symbol & vec3u;

export const builtin = {
  vertexIndex: Symbol('builtin_vertexIndex') as BuiltinVertexIndex,
  instanceIndex: Symbol('builtin_instanceIndex') as BuiltinInstanceIndex,
  position: Symbol('builtin_position') as BuiltinPosition,
  clipDistances: Symbol('builtin_clipDistances') as BuiltinClipDistances,
  frontFacing: Symbol('builtin_frontFacing') as BuiltinFrontFacing,
  fragDepth: Symbol('builtin_fragDepth') as BuiltinFragDepth,
  sampleIndex: Symbol('builtin_sampleIndex') as BuiltinSampleIndex,
  sampleMask: Symbol('builtin_sampleMask') as BuiltinSampleMask,
  fragment: Symbol('builtin_fragment') as BuiltinFragment,
  localInvocationId: Symbol(
    'builtin_localInvocationId',
  ) as BuiltinLocalInvocationId,
  localInvocationIndex: Symbol(
    'builtin_localInvocationIndex',
  ) as BuiltinLocalInvocationIndex,
  globalInvocationId: Symbol(
    'builtin_globalInvocationId',
  ) as BuiltinGlobalInvocationId,
  workgroupId: Symbol('builtin_workgroupId') as BuiltinWorkgroupId,
  numWorkgroups: Symbol('builtin_numWorkgroups') as BuiltinNumWorkgroups,
} as const;

const builtins = Object.values(builtin);

type Builtin = (typeof builtin)[keyof typeof builtin];

export function getUsedBuiltinsNamed(
  o: Record<Builtin, string>,
): { name: string; builtin: Builtin }[] {
  const res = Object.getOwnPropertySymbols(o).map((s) => {
    if (!builtins.includes(s as Builtin)) {
      throw new Error('Symbol is not a member of `builtin`');
    }
    const name = o[s as Builtin];
    if (!name) {
      throw new Error('Name is not provided');
    }
    return { name: name, builtin: s as Builtin };
  });

  return res;
}

export function getUsedBuiltins(o: Record<Builtin, string>): Builtin[] {
  const res = Object.getOwnPropertySymbols(o).map((s) => {
    if (!builtins.includes(s as Builtin)) {
      throw new Error('Symbol is not a member of `builtin`');
    }
    return s;
  });

  return res as Builtin[];
}

export type OmitSymbols<S extends object> = {
  [Key in keyof S as S[Key] extends symbol ? never : Key]: S[Key];
};

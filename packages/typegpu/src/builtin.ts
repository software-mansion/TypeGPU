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

const builtins = Object.values(builtin);

export function getUsedBuiltinsNamed(
  o: Record<symbol, string>,
): { name: string; builtin: symbol }[] {
  const res = Object.getOwnPropertySymbols(o).map((s) => {
    if (!builtins.includes(s)) {
      throw new Error('Symbol is not a member of `builtin`');
    }
    const name = o[s];
    if (!name) {
      throw new Error('Name is not provided');
    }
    return { name: name, builtin: s };
  });
  return res;
}

export function getUsedBuiltins(o: Record<symbol, string>): symbol[] {
  const res = Object.getOwnPropertySymbols(o).map((s) => {
    if (!builtins.includes(s)) {
      throw new Error('Symbol is not a member of `builtin`');
    }
    return s;
  });

  return res;
}

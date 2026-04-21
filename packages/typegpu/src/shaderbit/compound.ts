export interface CompoundBit<T> {
  '~shaderbit:wgsl': {
    reduce(): T;
  };
}

export type ReducibleTo<T> = CompoundBit<T> | T;

export function isCompoundBit(bit: unknown): bit is CompoundBit<unknown> {
  return !!(bit as CompoundBit<unknown>)['~shaderbit:wgsl'];
}

export function reduceIfCompound<T>(bit: ReducibleTo<T>): T {
  if (isCompoundBit(bit)) {
    return bit['~shaderbit:wgsl'].reduce();
  }
  return bit as T;
}

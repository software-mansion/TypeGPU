export interface TgpuDerived<T> {
  readonly resourceType: 'derived';
  compute(): T;
}

export function isDerived<T extends TgpuDerived<unknown>>(
  value: T | unknown,
): value is T {
  return (value as T)?.resourceType === 'derived';
}

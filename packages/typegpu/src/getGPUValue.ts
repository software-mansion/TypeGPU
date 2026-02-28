import { $gpuValueOf } from './shared/symbols.ts';
import type { WithGPUValue } from './types.ts';

export function getGPUValue(object: unknown): unknown {
  return (object as WithGPUValue<unknown>)?.[$gpuValueOf];
}

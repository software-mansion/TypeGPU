import { $gpuValueOf } from './shared/symbols.ts';
import type { WithGPUValue } from './types.ts';

export function extractGpuValueGetter(
  object: unknown,
): WithGPUValue<unknown>[typeof $gpuValueOf] | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: we're inspecting the value
  if (typeof (object as any)?.[$gpuValueOf] === 'function') {
    return (object as WithGPUValue<unknown>)[$gpuValueOf].bind(
      object,
    );
  }
  return undefined;
}

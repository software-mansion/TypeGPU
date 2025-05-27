import { $gpuValueOf } from './shared/symbols.ts';
import type { ResolutionCtx } from './types.ts';

export type GpuValueGetter = (ctx: ResolutionCtx) => unknown;

export function extractGpuValueGetter(
  object: unknown,
): GpuValueGetter | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: we're inspecting the value
  if (typeof (object as any)?.[$gpuValueOf] === 'function') {
    return (object as { [$gpuValueOf]: GpuValueGetter })[$gpuValueOf].bind(
      object,
    );
  }
  return undefined;
}

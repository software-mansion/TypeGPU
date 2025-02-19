import { inGPUMode } from '../gpuMode';

export function discard(): never {
  if (!inGPUMode()) {
    throw new Error('discard() can only be used on the GPU.');
  }
  return 'discard;' as never;
}

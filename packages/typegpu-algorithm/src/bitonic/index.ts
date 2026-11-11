import type { d, TgpuRoot } from 'typegpu';
import { define } from './define.ts';
import { instantiate } from './instantiate.ts';
import type { BitonicKeyType } from './kernels.ts';
import type { BitonicSortInstance, BitonicSortIo, BitonicSortOptions } from './types.ts';

export { define } from './define.ts';
export { instantiate } from './instantiate.ts';
export type { BitonicKeyType } from './kernels.ts';
export type {
  BitonicSortDefinition,
  BitonicSortInstance,
  BitonicSortIo,
  BitonicSortOptions,
  BitonicSortVariant,
} from './types.ts';

/**
 * `instantiate(root, define(root, options), io)`, for when the definition isn't shared or
 * precompiled.
 * @category Module
 */
export function defineAndInstantiate<
  TKey extends BitonicKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
>(
  root: TgpuRoot,
  options: BitonicSortOptions<TKey, TValue>,
  io: BitonicSortIo<TKey, TValue>,
): BitonicSortInstance {
  return instantiate(root, define(root, options), io);
}

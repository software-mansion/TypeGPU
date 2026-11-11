import type { d, TgpuRoot } from 'typegpu';
import { define } from './define.ts';
import { instantiate } from './instantiate.ts';
import type { RadixKeyType } from './schemas.ts';
import type { RadixSortInstance, RadixSortIo, RadixSortOptions } from './types.ts';

export { define } from './define.ts';
export { instantiate } from './instantiate.ts';
export { sortKey } from './key.ts';
export type { RadixKeyType, SortDirection } from './schemas.ts';
export type {
  RadixSortDefinition,
  RadixSortInstance,
  RadixSortIo,
  RadixSortOptions,
} from './types.ts';

/**
 * `instantiate(root, define(root, options), io)`, for when the definition isn't shared or
 * precompiled.
 * @category Module
 */
export function defineAndInstantiate<
  TKey extends RadixKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
>(
  root: TgpuRoot,
  options: RadixSortOptions<TKey, TValue>,
  io: RadixSortIo<TKey, TValue>,
): RadixSortInstance {
  return instantiate(root, define(root, options), io);
}

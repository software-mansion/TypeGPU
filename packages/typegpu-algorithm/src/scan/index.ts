import type { TgpuRoot } from 'typegpu';
import { define } from './define.ts';
import { instantiate } from './instantiate.ts';
import type { ScanElementType } from './schemas.ts';
import type { PrefixScanInstance, PrefixScanIo, PrefixScanOptions } from './types.ts';

export { define } from './define.ts';
export { instantiate } from './instantiate.ts';
export { reduce, scan } from './oneShot.ts';
export type { ScanElementType } from './schemas.ts';
export type {
  BinaryOp,
  PrefixScanDefinition,
  PrefixScanInstance,
  PrefixScanIo,
  PrefixScanOptions,
  ScanBuffer,
} from './types.ts';

/**
 * `instantiate(root, define(root, options), io)`, for when the definition isn't shared or
 * precompiled.
 * @category Module
 */
export function defineAndInstantiate<TElement extends ScanElementType>(
  root: TgpuRoot,
  options: PrefixScanOptions<TElement>,
  io: PrefixScanIo<TElement>,
): PrefixScanInstance<TElement> {
  return instantiate(root, define(root, options), io);
}

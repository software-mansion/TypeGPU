import type { TgpuRoot } from 'typegpu';
import { define, type HolographicOptions } from './define.ts';
import { type HolographicInstance, type HolographicIo, instantiate } from './instantiate.ts';

/**
 * `instantiate(root, define(root, options), io)`, for apps that don't precompile.
 * @category Module
 */
export function defineAndInstantiate(
  root: TgpuRoot,
  options: HolographicOptions,
  io: HolographicIo,
): HolographicInstance {
  return instantiate(root, define(root, options), io);
}

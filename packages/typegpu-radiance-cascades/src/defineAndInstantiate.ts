import type { TgpuRoot } from 'typegpu';
import { define, type RadianceCascadesOptions } from './define.ts';
import {
  instantiate,
  type OutputOf,
  type RadianceCascadesInstance,
  type RadianceCascadesIo,
} from './instantiate.ts';

/**
 * `instantiate(root, define(root, options), io)`, for apps that don't precompile.
 * @category Module
 */
export function defineAndInstantiate<TIo extends RadianceCascadesIo>(
  root: TgpuRoot,
  options: RadianceCascadesOptions,
  io: TIo,
): RadianceCascadesInstance<OutputOf<TIo>> {
  return instantiate(root, define(root, options), io);
}

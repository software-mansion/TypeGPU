import type { TgpuRoot } from 'typegpu';
import { define, type JumpFloodOptions } from './define.ts';
import { instantiate, type JumpFloodInstance, type JumpFloodIo } from './instantiate.ts';

export { define, type JumpFloodDefinition, type JumpFloodOptions } from './define.ts';
export {
  instantiate,
  type ColorTexture,
  type JumpFloodInstance,
  type JumpFloodIo,
  type SdfTexture,
} from './instantiate.ts';

/**
 * Turns a shader-side classifier into a signed distance field texture and a color texture, using
 * the Jump Flood Algorithm. Same as `instantiate(root, define(root, options), io)`.
 *
 * @example
 * ```ts
 * const flood = sdf.jumpFlood.defineAndInstantiate(
 *   root,
 *   { classify, getSdf, getColor },
 *   { size: { width: 512, height: 512 }, bindGroups: [sourceBindGroup] },
 * );
 *
 * const encoder = root.createCommandEncoder();
 * const pass = encoder.beginComputePass();
 * flood.step(pass);
 * pass.end();
 * encoder.submit();
 * ```
 *
 * @category Module
 */
export function defineAndInstantiate(
  root: TgpuRoot,
  options: JumpFloodOptions,
  io: JumpFloodIo,
): JumpFloodInstance {
  return instantiate(root, define(root, options), io);
}

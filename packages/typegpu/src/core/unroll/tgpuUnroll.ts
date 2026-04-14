import { stitch } from '../resolve/stitch.ts';
import { $gpuCallable, $internal, $resolve } from '../../../src/shared/symbols.ts';
import { setName } from '../../../src/shared/meta.ts';
import type { DualFn } from '../../../src/types.ts';
import { type ResolvedSnippet, snip, type Snippet } from '../../../src/data/snippet.ts';
import type { ResolutionCtx, SelfResolvable } from '../../../src/types.ts';
import type { BaseData } from '../../data/wgslTypes.ts';

/**
 * The result of calling `tgpu.unroll(...)`. The code responsible for
 * generating shader code can check if the value of a snippet is
 * an instance of `UnrollableIterable`, and act accordingly.
 */
export class UnrollableIterable implements SelfResolvable {
  readonly [$internal] = true;
  readonly snippet: Snippet;

  constructor(snippet: Snippet) {
    this.snippet = snippet;
  }

  [$resolve](_ctx: ResolutionCtx): ResolvedSnippet {
    return snip(stitch`${this.snippet}`, this.snippet.dataType as BaseData, this.snippet.origin);
  }
}

/**
 * Marks an iterable to be unrolled by the shader generator when used in a for loop.
 *
 * @example
 * ```ts
 * const neighborOffsets = [d.vec2i(0, 1), d.vec2i(0, -1), d.vec2i(1, 0), d.vec2i(-1, 0)];
 *
 * // Unrolls into 4 blocks of code, one for each offset.
 * for (const offset of tgpu.unroll(neighborOffsets)) {
 *   // ...
 * }
 * ```
 *
 * If you'd like to unroll over a range of numbers, use `tgpu.unroll(std.range(n))`.
 *
 * @example
 * ```ts
 * // (...)
 * const FBM_OCTAVES = 3;
 *
 * function fbm(pos: d.v3f): number {
 *   'use gpu';
 *   let sum = d.f32();
 *
 *   // i = 0, 1, 2
 *   for (const i of tgpu.unroll(std.range(FBM_OCTAVES))) {
 *     sum +=
 *       noise3d(pos * (CLOUD_FREQUENCY * FBM_LACUNARITY ** i)) *
 *       (CLOUD_AMPLITUDE * FBM_PERSISTENCE ** i);
 *   }
 *
 *   return sum;
 * }
 *
 * ```
 *
 * Generates:
 *
 * ```wgsl
 * // (...)
 *
 * fn fbm(pos: vec3f) -> f32 {
 *   var sum = 0f;
 *   // unrolled iteration #0
 *   {
 *     sum += noise3d(pos * 1.4f) * 1f;
 *   }
 *   // unrolled iteration #1
 *   {
 *     sum += noise3d(pos * 2.8f) * 0.5f;
 *   }
 *   // unrolled iteration #2
 *   {
 *     sum += noise3d(pos * 5.6f) * 0.25f;
 *   }
 *   return sum;
 * }
 * ```
 */
export const unroll = (() => {
  function jsImpl<T extends Iterable<unknown>>(iterable: T): T {
    return iterable;
  }

  const impl = jsImpl as unknown as DualFn<typeof jsImpl> & { [$internal]: true };

  setName(impl, 'unroll');
  impl.toString = () => 'unroll';
  impl[$internal] = true;
  impl[$gpuCallable] = {
    call(_ctx, [value]) {
      return snip(new UnrollableIterable(value), value.dataType, value.origin);
    },
  };

  return impl;
})();

import { stitch } from '../resolve/stitch.ts';
import {
  $gpuCallable,
  $internal,
  $resolve,
} from '../../../src/shared/symbols.ts';
import { setName } from '../../../src/shared/meta.ts';
import type { DualFn } from '../../../src/types.ts';
import type { AnyData } from '../../../src/data/dataTypes.ts';
import {
  type ResolvedSnippet,
  snip,
  type Snippet,
} from '../../../src/data/snippet.ts';
import type { ResolutionCtx, SelfResolvable } from '../../../src/types.ts';

/**
 * The result of calling `tgpu.unroll(...)`. The code responsible for
 * generating shader code can check if the value of a snippet is
 * an instance of `UnrollableIterable`, and act accordingly.
 */
export class UnrollableIterable implements SelfResolvable {
  readonly [$internal] = true;

  constructor(public readonly snippet: Snippet) {}

  [$resolve](_ctx: ResolutionCtx): ResolvedSnippet {
    return snip(
      stitch`${this.snippet}`,
      this.snippet.dataType as AnyData,
      this.snippet.origin,
    );
  }
}

/**
 * Marks an iterable to be unrolled by the wgslGenerator.
 */
export const unroll = (() => {
  const impl = (<T extends Iterable<unknown>>(value: T) => value) as unknown as
    & DualFn<(<T extends Iterable<unknown>>(value: T) => T)>
    & { [$internal]: true };

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

import { stitch } from '../resolve/stitch.ts';
import { $internal, $resolve } from '../../../src/shared/symbols.ts';
import { WgslTypeError } from '../../../src/errors.ts';
import { inCodegenMode } from '../../../src/execMode.ts';
import { setName } from '../../../src/shared/meta.ts';
import { DualFn } from '../../../src/data/dualFn.ts';

import { AnyData } from '../../../src/data/dataTypes.ts';
import { ResolvedSnippet, snip, Snippet } from '../../../src/data/snippet.ts';
import { ResolutionCtx, SelfResolvable } from 'src/types.ts';

/**
 * The result of calling `tgpu.unroll(...)`. The code responsible for
 * generating shader code can check if the value of a snippet is
 * an instance of `UnrolledIterable`, and act accordingly.
 */
export class UnrolledIterable implements SelfResolvable {
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
  const gpuImpl = (value: Snippet) => {
    return snip(new UnrolledIterable(value), value.dataType, value.origin);
  };

  const jsImpl = <T extends Iterable<unknown>>(value: T) => value;

  const impl = <T extends Iterable<unknown>>(value: T) => {
    if (inCodegenMode()) {
      return gpuImpl(value as unknown as Snippet);
    }
    return jsImpl(value);
  };

  setName(impl, 'unroll');
  impl.toString = () => 'unroll';
  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl,
      gpuImpl,
    },
  });

  return impl as unknown as DualFn<
    <T extends Iterable<unknown>>(value: T) => T
  >;
})();

import { type ResolvedSnippet } from '../data/snippet.ts';
import { $internal, $resolve, isMarkedInternal } from '../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../types.ts';

/**
 * WARNING: This is an API that touches a lot of internals, and is not stable
 * (can change between patches). You should probably talk to the TypeGPU team
 * before using this, maybe we can provide a better public API for your use case.
 *
 * Defines additional properties on `value` (mutates it) that makes TypeGPU
 * understand how it should handle passing this object to the `tgpu.resolve`
 * API, or just how to generate shader code from it to begin with.
 *
 * `value` can in particular be the prototype of a class, meaning all instances
 * of that class will be resolvable.
 */
export function makeResolvable<T>(
  value: T,
  options: makeResolvable.Options<T>,
): T & SelfResolvable {
  if (!isMarkedInternal(value)) {
    Object.defineProperty(value, $internal, {
      value: true,
    });
  }

  Object.defineProperty(value, 'toString', {
    value() {
      return options.asString.apply(this);
    },
  });

  Object.defineProperty(value, $resolve, {
    value(ctx: ResolutionCtx): ResolvedSnippet {
      return options.resolve.apply(this, [ctx]);
    },
  });

  return value as T & SelfResolvable;
}

export namespace makeResolvable {
  export interface Options<T> {
    resolve(this: T, ctx: ResolutionCtx): ResolvedSnippet;
    asString(this: T): string;
  }

  export type Resolvable = SelfResolvable;
}

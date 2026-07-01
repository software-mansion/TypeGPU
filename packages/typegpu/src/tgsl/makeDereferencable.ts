import { snip, type Origin } from '../data/snippet.ts';
import type { BaseData } from '../data/wgslTypes.ts';
import { $gpuValueOf, $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
import { valueProxyHandler } from '../core/valueProxyUtils.ts';
import type { SelfResolvable } from '../types.ts';
import { inCodegenMode } from '../execMode.ts';

/**
 * WARNING: This is an API that touches a lot of internals, and is not stable
 * (can change between patches). You should probably talk to the TypeGPU team
 * before using this, maybe we can provide a better public API for your use case.
 *
 * Defines additional properties on `value` (mutates it) that makes TypeGPU
 * understand how it should handle using .$ on that object. All dereferencable
 * value must also be made resolvable (through the makeResolvable API).
 *
 * `value` can in particular be the prototype of a class, meaning all instances
 * of that class will be dereferencable.
 */
export function makeDereferencable<T extends SelfResolvable & { readonly $: unknown }>(
  value: T,
  options: makeDereferencable.Options<T>,
): T {
  Object.defineProperty(value, $gpuValueOf, {
    get() {
      const [dataType, origin] = options.getDataTypeAndOrigin.apply(this);

      return new Proxy(
        {
          [$internal]: true,
          get [$ownSnippet]() {
            return snip(this, dataType, origin);
          },
          [$resolve]: (ctx) => ctx.resolve(this),
          toString: () => `${this.toString()}.$`,
        },
        valueProxyHandler,
      );
    },
  });

  Object.defineProperty(value, '$', {
    get() {
      if (inCodegenMode()) {
        return this[$gpuValueOf];
      }
      return options.derefInJS.apply(this);
    },
  });

  return value;
}

export namespace makeDereferencable {
  export interface Options<T extends SelfResolvable & { readonly $: unknown }> {
    derefInJS(this: T): T['$'];
    getDataTypeAndOrigin(this: T): [dataType: BaseData, origin: Origin];
  }
}

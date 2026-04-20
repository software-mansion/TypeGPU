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
 * understand how it should handle using .$ on that object. All dereferenceable
 * value must also be made resolvable (through the makeResolvable API).
 *
 * `value` can in particular be the prototype of a class, meaning all instances
 * of that class will be dereferenceable.
 */
export function makeDereferenceable<T extends SelfResolvable, TValue>(
  value: T,
  options: makeDereferenceable.Options<T, TValue>,
): T & { $: TValue } {
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

  if (options.setInJS) {
    // oxlint-disable-next-line typescript/unbound-method -- setInJS is explicitly bound down below
    const setInJS = options.setInJS;
    Object.defineProperty(value, '$', {
      get() {
        if (inCodegenMode()) {
          return this[$gpuValueOf];
        }
        return options.getInJS.apply(this);
      },
      set(v: TValue) {
        setInJS.apply(this, [v]);
      },
    });
  } else {
    Object.defineProperty(value, '$', {
      get() {
        if (inCodegenMode()) {
          return this[$gpuValueOf];
        }
        return options.getInJS.apply(this);
      },
    });
  }

  return value as T & { $: TValue };
}

export namespace makeDereferenceable {
  export interface Options<T extends SelfResolvable, TValue> {
    getInJS(this: T): TValue;
    setInJS?(this: T, value: TValue): void;
    getDataTypeAndOrigin(this: T): [dataType: BaseData, origin: Origin];
  }
}

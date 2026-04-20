import { snip, type Origin } from '../data/snippet.ts';
import type { BaseData } from '../data/wgslTypes.ts';
import { $gpuValueOf, $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
import { valueProxyHandler } from '../core/valueProxyUtils.ts';
import type { SelfResolvable } from '../types.ts';
import { inCodegenMode } from '../execMode.ts';

export function makeDereferencable<T extends SelfResolvable>(
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
      // TODO: Add proper error message
      throw new Error(
        'Cannot read WebGL uniform outside of shader code. Use `.write()` to update it.',
      );
    },
  });

  return value;
}

export namespace makeDereferencable {
  export interface Options<T> {
    getDataTypeAndOrigin(this: T): [dataType: BaseData, origin: Origin];
  }
}

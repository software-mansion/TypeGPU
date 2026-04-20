import { snip, type Origin, type ResolvedSnippet } from '../data/snippet.ts';
import { type BaseData } from '../data/wgslTypes.ts';
import { $internal, $resolve, isMarkedInternal } from '../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../types.ts';

/**
 *
 * @param value
 * @param options
 * @returns
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
      const protoSnippet = options.resolve.apply(this, [ctx]);

      return snip(protoSnippet.value, protoSnippet.dataType, protoSnippet.origin);
    },
  });

  return value as T & SelfResolvable;
}

interface ProtoSnippet {
  value: string;
  dataType: BaseData;
  origin: Origin;
}

export namespace makeResolvable {
  export interface Options<T> {
    resolve(this: T, ctx: ResolutionCtx): ProtoSnippet;
    asString(this: T): string;
  }

  export type Resolvable = SelfResolvable;
}

import type { AnyData } from '../../data/dataTypes.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { InferGPU } from '../../shared/repr.ts';
import {
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $resolve,
} from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import {
  applyExternals,
  type ExternalMap,
  replaceExternalsInWgsl,
} from '../resolve/externals.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

// ----------
// Public API
// ----------

/**
 * Extra declaration that shall be included in final WGSL code,
 * when resolving objects that use it.
 */
export interface TgpuRawCodeSnippet<TDataType extends AnyData> {
  $: InferGPU<TDataType>;
  value: InferGPU<TDataType>;

  $uses(dependencyMap: Record<string, unknown>): this;
}

/**
 * A typed WGSL expression that shall be included in final WGSL code,
 * when resolving objects that use it.
 */
export function rawCodeSnippet<TDataType extends AnyData>(
  expression: string,
  type: TDataType,
): TgpuRawCodeSnippet<TDataType> {
  return new TgpuRawCodeSnippetImpl(expression, type);
}

// --------------
// Implementation
// --------------

class TgpuRawCodeSnippetImpl<TDataType extends AnyData>
  implements TgpuRawCodeSnippet<TDataType>, SelfResolvable {
  readonly [$internal]: true;
  readonly dataType: TDataType;

  #expression: string;
  #externalsToApply: ExternalMap[];

  constructor(expression: string, type: TDataType) {
    this[$internal] = true;
    this.dataType = type;

    this.#expression = expression;
    this.#externalsToApply = [];
  }

  $uses(dependencyMap: Record<string, unknown>): this {
    this.#externalsToApply.push(dependencyMap);
    return this;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const externalMap: ExternalMap = {};

    for (const externals of this.#externalsToApply) {
      applyExternals(externalMap, externals);
    }

    const replacedExpression = replaceExternalsInWgsl(
      ctx,
      externalMap,
      this.#expression,
    );

    return snip(replacedExpression, this.dataType);
  }

  toString() {
    return `raw(${String(this.dataType)}): "${this.#expression}"`;
  }

  get [$gpuValueOf](): InferGPU<TDataType> {
    const dataType = this.dataType;

    return new Proxy({
      [$internal]: true,
      get [$ownSnippet]() {
        return snip(this, dataType);
      },
      [$resolve]: (ctx) => ctx.resolve(this),
      toString: () => `raw(${String(this.dataType)}): "${this.#expression}".$`,
    }, valueProxyHandler) as InferGPU<TDataType>;
  }

  get $(): InferGPU<TDataType> {
    if (!inCodegenMode()) {
      throw new Error('Raw code snippets can only be used on the GPU.');
    }

    return this[$gpuValueOf];
  }

  get value(): InferGPU<TDataType> {
    return this.$;
  }
}

import type { AnyData } from '../../data/dataTypes.ts';
import { type Origin, type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $ownSnippet, $resolve } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { applyExternals, type ExternalMap, replaceExternalsInWgsl } from '../resolve/externals.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

// ----------
// Public API
// ----------

/**
 * Extra declaration that will be included in final WGSL code
 * when resolving objects that use it.
 */
export interface TgpuRawCodeSnippet<TDataType extends BaseData> {
  $: InferGPU<TDataType>;
  value: InferGPU<TDataType>;
  readonly [$gpuValueOf]: InferGPU<TDataType>;

  $uses(dependencyMap: Record<string, unknown>): this;
}

// The origin 'function' refers to values passed in from the calling scope, which means
// we would have access to this value anyway. Same goes for 'argument' and 'this-function',
// the values literally exist in the function we're writing.
//
// 'constant-ref' was excluded because it's a special origin reserved for tgpu.const values.
export type RawCodeSnippetOrigin = Exclude<
  Origin,
  'function' | 'this-function' | 'argument' | 'constant-ref'
>;

/**
 * An advanced API that creates a typed shader expression which
 * can be injected into the final shader bundle upon use.
 *
 * @param expression The code snippet that will be injected in place of `foo.$`
 * @param type The type of the expression
 * @param [origin='runtime'] Where the value originates from.
 *
 * **-- Which origin to choose?**
 *
 * Usually 'runtime' (the default) is a safe bet, but if you're sure that the expression or
 * computation is constant (either a reference to a constant, a numeric literal,
 * or an operation on constants), then pass 'constant' as it might lead to better
 * optimizations.
 *
 * If what the expression is a direct reference to an existing value (e.g. a uniform, a
 * storage binding, ...), then choose from 'uniform', 'mutable', 'readonly', 'workgroup',
 * 'private' or 'handle' depending on the address space of the referred value.
 *
 * @example
 * ```ts
 * // An identifier that we know will be in the
 * // final shader bundle, but we cannot
 * // refer to it in any other way.
 * const existingGlobal = tgpu['~unstable']
 *   .rawCodeSnippet('EXISTING_GLOBAL', d.f32, 'constant');
 *
 * const foo = () => {
 *   'use gpu';
 *   return existingGlobal.$ * 2;
 * };
 *
 * const wgsl = tgpu.resolve([foo]);
 * // fn foo() -> f32 {
 * //   return EXISTING_GLOBAL * 2;
 * // }
 * ```
 */
export function rawCodeSnippet<TDataType extends AnyData>(
  expression: string,
  type: TDataType,
  origin: RawCodeSnippetOrigin | undefined = 'runtime',
): TgpuRawCodeSnippet<TDataType> {
  return new TgpuRawCodeSnippetImpl(expression, type, origin);
}

// --------------
// Implementation
// --------------

class TgpuRawCodeSnippetImpl<TDataType extends BaseData>
  implements TgpuRawCodeSnippet<TDataType>, SelfResolvable
{
  readonly [$internal]: true;
  readonly dataType: TDataType;
  readonly origin: RawCodeSnippetOrigin;

  #expression: string;
  #externalsToApply: ExternalMap[];

  constructor(expression: string, type: TDataType, origin: RawCodeSnippetOrigin) {
    this[$internal] = true;
    this.dataType = type;
    this.origin = origin;

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

    const replacedExpression = replaceExternalsInWgsl(ctx, externalMap, this.#expression);

    return snip(replacedExpression, this.dataType, this.origin);
  }

  toString() {
    return `raw(${String(this.dataType)}): "${this.#expression}"`;
  }

  get [$gpuValueOf](): InferGPU<TDataType> {
    const dataType = this.dataType;
    const origin = this.origin;

    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, dataType, origin);
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `raw(${String(this.dataType)}): "${this.#expression}".$`,
      },
      valueProxyHandler,
    ) as InferGPU<TDataType>;
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

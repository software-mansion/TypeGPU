import { snip } from '../../data/snippet.ts';
import { Void } from '../../data/wgslTypes.ts';
import { $internal } from '../../shared/symbols.ts';
import { type ExternalMap, replaceExternalsInWgsl } from '../resolve/externals.ts';
import type { InferGPU } from '../../data/index.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';

// ----------
// Public API
// ----------

/**
 * Extra declaration that shall be included in final WGSL code,
 * when resolving objects that use it.
 */
export interface TgpuDeclare {
  [$internal]: true;
  $uses(dependencyMap: Record<string, unknown>): this;
  $: InferGPU<Void>;
}

/**
 * Allows defining extra declarations that shall be included in the final WGSL code,
 * when resolving objects that use them.
 *
 * Using this API is generally discouraged, as it shouldn't be necessary in any common scenario.
 * It was developed to ensure full compatibility of TypeGPU programs with current and future versions of WGSL.
 */
export function declare(declaration: string): TgpuDeclare {
  return new TgpuDeclareImpl(declaration);
}

// --------------
// Implementation
// --------------

export class TgpuDeclareImpl implements TgpuDeclare {
  #externals: ExternalMap | undefined;
  #declaration: string;

  constructor(declaration: string) {
    this.#declaration = declaration;
  }

  // prototype properties
  declare [$internal]: true;
  declare $: InferGPU<Void>;

  static {
    TgpuDeclareImpl.prototype[$internal] = true;

    makeDereferenceable(
      makeResolvable(TgpuDeclareImpl.prototype, {
        asString() {
          return `declare: ${this.#declaration}`;
        },
        resolve(ctx) {
          const replacedDeclaration = replaceExternalsInWgsl(
            ctx,
            this.#externals ?? {},
            this.#declaration,
          );

          ctx.addDeclaration(replacedDeclaration);
          return snip('', Void, /* origin */ 'constant');
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(
              trackingProxy,
              Void,
              /* origin */ 'constant',
              /* possibleSideEffects */ false,
            );
          },
        },
        normalMode: { get() {} },
      },
    );
  }

  $uses(dependencyMap: Record<string, unknown>): this {
    if (this.#externals !== undefined) {
      throw new Error(
        "Cannot call '$uses' multiple times. If you wish to override dependencies, use slots or accessors instead.",
      );
    }
    this.#externals = dependencyMap;
    return this;
  }
}

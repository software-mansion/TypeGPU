import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { Void } from '../../data/wgslTypes.ts';
import { $internal, $resolve } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { applyExternals, type ExternalMap, replaceExternalsInWgsl } from '../resolve/externals.ts';

// ----------
// Public API
// ----------

/**
 * Extra declaration that shall be included in final WGSL code,
 * when resolving objects that use it.
 */
export interface TgpuDeclare {
  $uses(dependencyMap: Record<string, unknown>): this;
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

class TgpuDeclareImpl implements TgpuDeclare, SelfResolvable {
  readonly [$internal] = true;
  private externalsToApply: ExternalMap[] = [];

  constructor(private declaration: string) {}

  $uses(dependencyMap: Record<string, unknown>): this {
    this.externalsToApply.push(dependencyMap);
    return this;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const externalMap: ExternalMap = {};

    for (const externals of this.externalsToApply) {
      applyExternals(externalMap, externals);
    }

    const replacedDeclaration = replaceExternalsInWgsl(ctx, externalMap, this.declaration);

    ctx.addDeclaration(replacedDeclaration);
    return snip('', Void, /* origin */ 'constant');
  }

  toString() {
    return `declare: ${this.declaration}`;
  }
}

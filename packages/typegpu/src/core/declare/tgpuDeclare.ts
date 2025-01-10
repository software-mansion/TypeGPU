import type { ResolutionCtx, TgpuResolvable } from '../../types';
import {
  type ExternalMap,
  applyExternals,
  replaceExternalsInWgsl,
} from '../resolve/externals';

// ----------
// Public API
// ----------

/**
 * Extra declaration that shall be included in final WGSL code,
 * when resolving objects that use it.
 */
export interface TgpuDeclare extends TgpuResolvable {
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

class TgpuDeclareImpl implements TgpuDeclare {
  private externalsToApply: ExternalMap[] = [];

  constructor(private declaration: string) {}

  $uses(dependencyMap: Record<string, unknown>): this {
    this.externalsToApply.push(dependencyMap);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const externalMap: ExternalMap = {};

    for (const externals of this.externalsToApply) {
      applyExternals(externalMap, externals);
    }

    const replacedDeclaration = replaceExternalsInWgsl(
      ctx,
      externalMap,
      this.declaration,
    );

    ctx.addDeclaration(replacedDeclaration);
    return '';
  }

  toString() {
    return `declare: ${this.declaration}`;
  }
}

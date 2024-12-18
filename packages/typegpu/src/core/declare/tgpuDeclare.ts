import type { TgpuNamable } from '../../namable';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import {
  type ExternalMap,
  applyExternals,
  replaceExternalsInWgsl,
} from '../resolve/externals';

// ----------
// Public API
// ----------

export interface TgpuDeclare extends TgpuResolvable, TgpuNamable {
  readonly label: string | undefined;
  $uses(dependencyMap: Record<string, unknown>): this;
}

export function declare(declaration: string): TgpuDeclare {
  return new TgpuDeclareImpl(declaration);
}

// --------------
// Implementation
// --------------

class TgpuDeclareImpl implements TgpuDeclare {
  private _label: string | undefined;
  private externalsToApply: ExternalMap[] = [];

  constructor(private declaration: string) {}

  $uses(dependencyMap: Record<string, unknown>): this {
    this.externalsToApply.push(dependencyMap);
    return this;
  }

  get label(): string | undefined {
    return this._label;
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

  $name(label?: string | undefined): this {
    this._label = label;
    return this;
  }
}

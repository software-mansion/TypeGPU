import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslConst {
  alias(label: string): WgslConst;
}

/**
 * Creates a constant is computed at shader initialization according
 * to the passed in expression.
 */
export function constant(expr: Wgsl): WgslConst {
  return new WgslConstImpl(expr);
}

// --------------
// Implementation
// --------------

class WgslConstImpl implements WgslConst {
  public debugLabel?: string | undefined;
  public identifier = new WgslIdentifier();

  constructor(private readonly expr: Wgsl) {}

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    this.identifier.alias(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(code`const ${this.identifier} = ${this.expr};`);

    return ctx.resolve(this.identifier);
  }
}

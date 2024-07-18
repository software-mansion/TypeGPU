import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslConst extends WgslResolvable {
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

  constructor(private readonly expr: Wgsl) {}

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().alias(this.debugLabel);

    ctx.addDependency(code`const ${identifier} = ${this.expr};`);

    return ctx.resolve(identifier);
  }
}

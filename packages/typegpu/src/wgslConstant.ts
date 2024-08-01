import type { ResolutionCtx, Wgsl, WgslNamable, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
import { WgslResolvableBase } from './wgslResolvableBase';

// ----------
// Public API
// ----------

export interface WgslConst extends WgslResolvable, WgslNamable {}

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

class WgslConstImpl extends WgslResolvableBase implements WgslConst {
  readonly typeInfo = 'const';

  constructor(private readonly expr: Wgsl) {
    super();
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this.label);

    ctx.addDeclaration(code`const ${identifier} = ${this.expr};`);

    return ctx.resolve(identifier);
  }
}

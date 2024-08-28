import type { ResolutionCtx, Wgsl, WgslNamable, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

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

class WgslConstImpl implements WgslConst {
  private _label: string | undefined;

  constructor(private readonly expr: Wgsl) {}

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this._label);

    ctx.addDeclaration(code`const ${identifier} = ${this.expr};`);

    return ctx.resolve(identifier);
  }
}

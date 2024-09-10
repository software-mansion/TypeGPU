import type { TgpuNamable } from './namable';
import { code } from './tgpuCode';
import { TgpuIdentifier } from './tgpuIdentifier';
import type { ResolutionCtx, TgpuResolvable, Wgsl } from './types';

// ----------
// Public API
// ----------

export interface TgpuConst extends TgpuResolvable, TgpuNamable {}

/**
 * Creates a constant is computed at shader initialization according
 * to the passed in expression.
 */
export function constant(expr: Wgsl): TgpuConst {
  return new TgpuConstImpl(expr);
}

// --------------
// Implementation
// --------------

class TgpuConstImpl implements TgpuConst {
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
    const identifier = new TgpuIdentifier().$name(this._label);

    ctx.addDeclaration(code`const ${identifier} = ${this.expr};`);

    return ctx.resolve(identifier);
  }
}

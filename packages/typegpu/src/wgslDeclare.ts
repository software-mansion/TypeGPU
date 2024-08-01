import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';
import { code } from './wgslCode';

// ----------
// Public API
// ----------

export interface WgslDeclare extends WgslResolvable {}

export const declare = (declaration: Wgsl): WgslDeclare =>
  new WgslDeclareImpl(declaration);

// --------------
// Implementation
// --------------

class WgslDeclareImpl implements WgslDeclare {
  constructor(private readonly _declaration: Wgsl) {}

  resolve(ctx: ResolutionCtx): string {
    ctx.addDeclaration(code`${this._declaration}`);
    return '';
  }
}

import type {
  InlineResolve,
  ResolutionCtx,
  Wgsl,
  WgslResolvable,
} from './types';
import { code } from './wgslCode';

// ----------
// Public API
// ----------

export interface WgslDeclare extends WgslResolvable {}

export function declare(
  strings: TemplateStringsArray,
  ...params: (Wgsl | Wgsl[] | InlineResolve)[]
): WgslDeclare {
  return new WgslDeclareImpl(code(strings, ...params));
}

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

import { code } from './tgpuCode';
import type { ResolutionCtx, TgpuResolvable, Wgsl } from './types';

// ----------
// Public API
// ----------

export interface TgpuDeclare extends TgpuResolvable {}

export function declare(
  strings: TemplateStringsArray,
  ...params: (Wgsl | Wgsl[])[]
): TgpuDeclare {
  return new TgpuDeclareImpl(code(strings, ...params));
}

// --------------
// Implementation
// --------------

class TgpuDeclareImpl implements TgpuDeclare {
  constructor(private readonly _declaration: Wgsl) {}

  resolve(ctx: ResolutionCtx): string {
    ctx.addDeclaration(ctx.resolve(this._declaration));
    return '';
  }
}

import type {
  InlineResolve,
  ResolutionCtx,
  Tgpu,
  TgpuResolvable,
} from './types';
import { code } from './wgslCode';

// ----------
// Public API
// ----------

export interface TgpuDeclare extends TgpuResolvable {}

export function declare(
  strings: TemplateStringsArray,
  ...params: (Tgpu | Tgpu[] | InlineResolve)[]
): TgpuDeclare {
  return new TgpuDeclareImpl(code(strings, ...params));
}

// --------------
// Implementation
// --------------

class TgpuDeclareImpl implements TgpuDeclare {
  constructor(private readonly _declaration: Tgpu) {}

  resolve(ctx: ResolutionCtx): string {
    ctx.addDeclaration(code`${this._declaration}`);
    return '';
  }
}

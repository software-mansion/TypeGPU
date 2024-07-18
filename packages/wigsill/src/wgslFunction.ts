import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslFn extends WgslResolvable {
  $name(debugLabel: string): WgslFn;
}

export function fn(debugLabel?: string) {
  return (strings: TemplateStringsArray, ...params: Wgsl[]): WgslFn => {
    const func = new WgslFnImpl(code(strings, ...params));
    if (debugLabel) {
      func.$name(debugLabel);
    }
    return func;
  };
}

// --------------
// Implementation
// --------------

class WgslFnImpl implements WgslFn {
  private identifier = new WgslIdentifier();

  constructor(private readonly body: Wgsl) {}

  $name(debugLabel: string) {
    this.identifier.$name(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(code`fn ${this.identifier}${this.body}`);

    return ctx.resolve(this.identifier);
  }
}

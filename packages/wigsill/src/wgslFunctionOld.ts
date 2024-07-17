import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WGSLIdentifier } from './wgslIdentifier';

export interface WgslFn extends WgslResolvable {
  alias(debugLabel: string): WgslFn;
}

class WGSLFunction implements WgslFn {
  private identifier = new WGSLIdentifier();

  constructor(private readonly body: Wgsl) {}

  alias(debugLabel: string) {
    this.identifier.alias(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(code`fn ${this.identifier}${this.body}`);

    return ctx.resolve(this.identifier);
  }
}

export function fn(debugLabel?: string) {
  return (strings: TemplateStringsArray, ...params: Wgsl[]): WgslFn => {
    const func = new WGSLFunction(code(strings, ...params));
    if (debugLabel) {
      func.alias(debugLabel);
    }
    return func;
  };
}

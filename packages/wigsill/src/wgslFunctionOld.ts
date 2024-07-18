import type { ResolutionCtx, WGSLItem, WGSLSegment } from './types';
import { code } from './wgslCode';
import { WGSLIdentifier } from './wgslIdentifier';

export class WGSLFunction implements WGSLItem {
  private identifier = new WGSLIdentifier();

  constructor(private readonly body: WGSLSegment) {}

  $name(debugLabel: string) {
    this.identifier.$name(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(code`fn ${this.identifier}${this.body}`);

    return ctx.resolve(this.identifier);
  }
}

export function fn(debugLabel?: string) {
  return (
    strings: TemplateStringsArray,
    ...params: WGSLSegment[]
  ): WGSLFunction => {
    const func = new WGSLFunction(code(strings, ...params));
    if (debugLabel) {
      func.$name(debugLabel);
    }
    return func;
  };
}

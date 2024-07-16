import { isWGSLItem, ResolutionCtx, WGSLItem, WGSLSegment } from './types';
import { code } from './wgslCode';
import { WGSLIdentifier } from './wgslIdentifier';

export class WGSLFunction implements WGSLItem {
  private identifier = new WGSLIdentifier();

  constructor(private readonly body: WGSLSegment) {}

  alias(debugLabel: string) {
    this.identifier.alias(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(code`fn ${this.identifier}${this.body}`);

    return ctx.resolve(this.identifier);
  }

  getChildItems(ctx: ResolutionCtx): WGSLItem[] {
    const items = new Set<WGSLItem>();
    if (isWGSLItem(this.body)) {
      items.add(this.body);
      this.body.getChildItems(ctx).forEach((item) => items.add(item));
    }
    return Array.from(items);
  }
}

export function fn(debugLabel?: string) {
  return (
    strings: TemplateStringsArray,
    ...params: WGSLSegment[]
  ): WGSLFunction => {
    const func = new WGSLFunction(code(strings, ...params));
    if (debugLabel) {
      func.alias(debugLabel);
    }
    return func;
  };
}

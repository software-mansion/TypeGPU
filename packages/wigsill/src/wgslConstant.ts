import {
  isWGSLItem,
  type ResolutionCtx,
  type WGSLItem,
  type WGSLSegment,
} from './types';
import { code } from './wgslCode';
import { WGSLIdentifier } from './wgslIdentifier';

/**
 * Creates a constant is computed at shader initialization according
 * to the passed in expression.
 */
export class WGSLConstant implements WGSLItem {
  public debugLabel?: string | undefined;
  public identifier = new WGSLIdentifier();

  constructor(private readonly expr: WGSLSegment) {}

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    this.identifier.alias(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(code`const ${this.identifier} = ${this.expr};`);

    return ctx.resolve(this.identifier);
  }

  getChildItems(ctx: ResolutionCtx): WGSLItem[] | [] {
    const items = new Set<WGSLItem>([this.identifier]);
    if (isWGSLItem(this.expr)) {
      items.add(this.expr);
      this.expr.getChildItems(ctx).forEach((item) => items.add(item));
    }
    return Array.from(items);
  }
}

export function constant(expr: WGSLSegment): WGSLConstant {
  return new WGSLConstant(expr);
}

import {
  ResolutionCtx,
  WGSLBindableTrait,
  WGSLCompoundTrait,
  WGSLItem,
  WGSLSegment,
  hasCompoundTrait,
} from './types';

export class WGSLPlaceholder
  implements WGSLItem, WGSLBindableTrait<WGSLSegment>, WGSLCompoundTrait
{
  __bindingType!: WGSLSegment;
  public debugLabel?: string | undefined;

  constructor(public defaultSegment?: WGSLSegment) {}

  public alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    return this;
  }

  private getSegment(ctx: ResolutionCtx) {
    if (this.defaultSegment) {
      return ctx.tryBinding(this, this.defaultSegment);
    }

    return ctx.requireBinding(this);
  }

  getChildren(ctx: ResolutionCtx): WGSLItem[] {
    const segment = this.getSegment(ctx);

    if (hasCompoundTrait(segment)) {
      return segment.getChildren(ctx);
    }

    return [];
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this.getSegment(ctx));
  }
}

export function placeholder(defaultSegment?: WGSLSegment): WGSLPlaceholder {
  return new WGSLPlaceholder(defaultSegment);
}

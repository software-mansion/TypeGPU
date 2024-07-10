import {
  IResolutionCtx,
  WGSLBindableTrait,
  WGSLItem,
  WGSLSegment,
} from './types';

export class WGSLPlaceholder
  implements WGSLItem, WGSLBindableTrait<WGSLSegment>
{
  __bindingType!: WGSLSegment;
  public debugLabel?: string | undefined;

  constructor(public defaultSegment?: WGSLSegment) {}

  public alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    return this;
  }

  private getSegment(ctx: IResolutionCtx) {
    if (this.defaultSegment) {
      return ctx.tryBinding(this, this.defaultSegment);
    }

    return ctx.requireBinding(this);
  }

  resolve(ctx: IResolutionCtx): string {
    return ctx.resolve(this.getSegment(ctx));
  }
}

export function placeholder(defaultSegment?: WGSLSegment): WGSLPlaceholder {
  return new WGSLPlaceholder(defaultSegment);
}

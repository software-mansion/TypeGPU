import { BoundResolutionCtx } from './boundResolutionCtx';
import { ResolutionCtx, WGSLBindableTrait, WGSLItem } from './types';

export class WGSLBound<TItem extends WGSLItem, TBinding> implements WGSLItem {
  debugLabel?: string | undefined;

  constructor(
    public readonly contents: TItem,
    private readonly _bindable: WGSLBindableTrait<TBinding>,
    private readonly _binding: TBinding,
  ) {}

  resolve(ctx: ResolutionCtx): string {
    const boundCtx = new BoundResolutionCtx(ctx, this._bindable, this._binding);
    return boundCtx.resolve(this.contents);
  }
}

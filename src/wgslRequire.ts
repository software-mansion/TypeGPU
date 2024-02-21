import type { IResolutionCtx, WGSLItem } from './types';

export class WGSLRequire implements WGSLItem {
  constructor(private readonly item: WGSLItem) {}

  resolve(ctx: IResolutionCtx): string {
    ctx.addDependency(this.item);
    return '';
  }
}

export function require(item: WGSLItem) {
  return new WGSLRequire(item);
}

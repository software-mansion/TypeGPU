import type { ResolutionCtx, WGSLItem } from './types';

export class WGSLRequire implements WGSLItem {
  constructor(private readonly item: WGSLItem) {}

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(this.item);
    return '';
  }

  getChildItems(): WGSLItem[] {
    return [...new Set([this.item])];
  }
}

export function require(item: WGSLItem) {
  return new WGSLRequire(item);
}

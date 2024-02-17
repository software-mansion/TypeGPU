import { IResolutionCtx, WGSLItem } from './types';

export class WGSLIdentifier implements WGSLItem {
  debugLabel?: string | undefined;

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
  }

  resolve(ctx: IResolutionCtx): string {
    return ctx.nameFor(this);
  }
}

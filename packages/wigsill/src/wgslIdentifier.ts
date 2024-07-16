import { ResolutionCtx, WGSLItem } from './types';

export class WGSLIdentifier implements WGSLItem {
  debugLabel?: string | undefined;

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.nameFor(this);
  }
}

export function identifier(debugLabel?: string) {
  const value = new WGSLIdentifier();

  if (debugLabel) {
    value.alias(debugLabel);
  }

  return value;
}

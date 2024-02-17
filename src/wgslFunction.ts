import { IResolutionCtx, WGSLItem, WGSLSegment } from './types';
import { code } from './wgslCode';
import { WGSLIdentifier } from './wgslIdentifier';

export class WGSLFunction implements WGSLItem {
  private identifier = new WGSLIdentifier();

  public debugLabel?: string | undefined;

  constructor(private readonly body: WGSLSegment) {}

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    return this;
  }

  resolve(ctx: IResolutionCtx): string {
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
      func.alias(debugLabel);
    }
    return func;
  };
}

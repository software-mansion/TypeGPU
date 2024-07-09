import {
  ResolutionCtx,
  WGSLBindableTrait,
  WGSLItem,
  WGSLSegment,
} from './types';
import { WGSLBound } from './wgslBound';
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

  with<T>(
    bindable: WGSLBindableTrait<T>,
    value: T,
  ): WGSLBound<WGSLFunction, T> {
    // We are duplicating the function, giving it the same body, but a
    // different identifier and binding context.
    return new WGSLBound(new WGSLFunction(this.body), bindable, value);
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

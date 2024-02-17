import { IResolutionCtx, WGSLBindableTrait, WGSLItem } from './types';

export type WGSLParamValue = string | number;

export class WGSLParam implements WGSLItem, WGSLBindableTrait<WGSLParamValue> {
  readonly __bindingType!: WGSLParamValue;

  debugLabel?: string | undefined;

  constructor(public readonly defaultValue?: WGSLParamValue) {}

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    return this;
  }

  /**
   * TODO: Documentation
   * @throws {MissingBindingError}
   */
  resolve(ctx: IResolutionCtx): string {
    if (this.defaultValue) {
      return String(ctx.tryBinding(this, this.defaultValue));
    }

    return String(ctx.requireBinding(this));
  }
}

export function param(defaultValue?: WGSLParamValue): WGSLParam {
  return new WGSLParam(defaultValue);
}

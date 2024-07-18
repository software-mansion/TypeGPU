import type { BindPair, ResolutionCtx, Wgsl, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslFn extends WgslResolvable {
  $name(label: string): WgslFn;
}

export function fn(label?: string) {
  return (strings: TemplateStringsArray, ...params: Wgsl[]): WgslFn => {
    const func = new WgslFnImpl(code(strings, ...params), []);
    if (label) {
      func.$name(label);
    }
    return func;
  };
}

// --------------
// Implementation
// --------------

class WgslFnImpl implements WgslFn {
  private _label: string | undefined;

  constructor(
    private readonly body: Wgsl,
    private readonly _bindings: BindPair<unknown>[],
  ) {}

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this._label);

    ctx.addDeclaration(code`fn ${identifier}${this.body}`, this._bindings);

    return ctx.resolve(identifier, this._bindings);
  }
}

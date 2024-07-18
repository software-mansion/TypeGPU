import type {
  BindPair,
  ResolutionCtx,
  Wgsl,
  WgslBindable,
  WgslResolvable,
} from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslFn extends WgslResolvable {
  alias(label: string): WgslFn;
}

export function fn(label?: string) {
  return (strings: TemplateStringsArray, ...params: Wgsl[]): WgslFn => {
    const func = new WgslFnImpl(code(strings, ...params), []);

    if (label) {
      func.alias(label);
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
    private readonly _body: Wgsl,
    private readonly _bindings: BindPair<unknown>[],
  ) {}

  alias(label: string | undefined) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().alias(this._label);

    ctx.addDependency(code`fn ${identifier}${this._body}`);

    return ctx.resolve(identifier);
  }

  with<TBinding>(bindable: WgslBindable<TBinding>, value: TBinding) {
    // Shallow copy, with an additional binding.
    // Not checking for uniqueness against `bindable`, to
    // allow for binding overrides, so later bindings override
    // earlier ones.
    return new WgslFnImpl(this._body, [...this._bindings, [bindable, value]]);
  }
}

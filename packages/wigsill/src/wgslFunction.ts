import type {
  ResolutionCtx,
  SlotValuePair,
  Wgsl,
  WgslResolvable,
  WgslSlot,
} from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslFn extends WgslResolvable {
  $name(label: string): WgslFn;

  with<T>(slot: WgslSlot<T>, value: T): BoundWgslFn;
}

export type BoundWgslFn = Omit<WgslFn, '$name'>;

export function fn(label?: string) {
  return (strings: TemplateStringsArray, ...params: Wgsl[]): WgslFn => {
    const func = new WgslFnImpl(code(strings, ...params));
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

  constructor(private readonly body: Wgsl) {}

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this._label);

    ctx.addDeclaration(code`fn ${identifier}${this.body}`.$name(this._label));

    return ctx.resolve(identifier);
  }

  with<T>(slot: WgslSlot<T>, value: T): BoundWgslFn {
    return new BoundWgslFnImpl(this, [slot, value]);
  }

  toString(): string {
    return `fn:${this.label ?? '<unnamed>'}`;
  }
}

class BoundWgslFnImpl<T> implements BoundWgslFn {
  constructor(
    private readonly _innerFn: BoundWgslFn,
    private readonly _slotValuePair: SlotValuePair<T>,
  ) {}

  get label() {
    return this._innerFn.label;
  }

  with<TValue>(slot: WgslSlot<TValue>, value: TValue): BoundWgslFn {
    return new BoundWgslFnImpl(this, [slot, value]);
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this._innerFn, [this._slotValuePair]);
  }

  toString(): string {
    const [slot, value] = this._slotValuePair;
    return `fn:${this.label ?? '<unnamed>'}[${slot.label ?? '<unnamed>'}=${value}]`;
  }
}

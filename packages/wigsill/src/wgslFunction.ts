import type {
  Eventual,
  InlineResolve,
  ResolutionCtx,
  SlotValuePair,
  Wgsl,
  WgslResolvable,
  WgslSlot,
} from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
import { WgslResolvableBase } from './wgslResolvableBase';

// ----------
// Public API
// ----------

export interface WgslFn extends WgslResolvable {
  with<T>(slot: WgslSlot<T>, value: Eventual<T>): WgslFn;
}

export function fn(label?: string) {
  return (
    strings: TemplateStringsArray,
    ...params: (Wgsl | InlineResolve)[]
  ): WgslFn => {
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

class WgslFnImpl extends WgslResolvableBase implements WgslFn {
  typeInfo = 'fn';

  constructor(private readonly body: Wgsl) {
    super();
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this.label);

    ctx.addDeclaration(code`fn ${identifier}${this.body}`.$name(this.label));

    return ctx.resolve(identifier);
  }

  with<T>(slot: WgslSlot<T>, value: T): WgslFn {
    return new BoundWgslFnImpl(this, [slot, value]);
  }
}

class BoundWgslFnImpl<T> extends WgslResolvableBase implements WgslFn {
  typeInfo = 'fn';

  constructor(
    private readonly _innerFn: WgslFn,
    private readonly _slotValuePair: SlotValuePair<T>,
  ) {
    super();
  }

  with<TValue>(slot: WgslSlot<TValue>, value: Eventual<TValue>): WgslFn {
    return new BoundWgslFnImpl(this, [slot, value]);
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this._innerFn, [this._slotValuePair]);
  }

  get debugRepr(): string {
    const [slot, value] = this._slotValuePair;
    return `${this.typeInfo}:${this.label ?? '<unnamed>'}[${slot.label ?? '<unnamed>'}=${value}]`;
  }
}

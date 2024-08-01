import type {
  Eventual,
  InlineResolve,
  ResolutionCtx,
  SlotValuePair,
  Wgsl,
  WgslNamable,
  WgslResolvable,
  WgslSlot,
} from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
import { WgslResolvableBase } from './wgslResolvableBase';

// ----------
// Public API
// ----------

export interface WgslFn extends WgslResolvable, WgslNamable {
  with<T>(slot: WgslSlot<T>, value: Eventual<T>): BoundWgslFn;
}

export type BoundWgslFn = Omit<WgslFn, '$name'>;

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
  readonly typeInfo = 'fn';

  constructor(private readonly body: Wgsl) {
    super();
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this.label);

    ctx.addDeclaration(code`fn ${identifier}${this.body}`.$name(this.label));

    return ctx.resolve(identifier);
  }

  with<T>(slot: WgslSlot<T>, value: T): BoundWgslFn {
    return new BoundWgslFnImpl(this, [slot, value]);
  }
}

class BoundWgslFnImpl<T> implements BoundWgslFn {
  constructor(
    private readonly _innerFn: BoundWgslFn,
    private readonly _slotValuePair: SlotValuePair<T>,
  ) {}

  readonly typeInfo = 'fn';

  with<TValue>(slot: WgslSlot<TValue>, value: Eventual<TValue>): BoundWgslFn {
    return new BoundWgslFnImpl(this, [slot, value]);
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this._innerFn, [this._slotValuePair]);
  }

  get label() {
    return this._innerFn.label;
  }

  get debugRepr(): string {
    const [slot, value] = this._slotValuePair;
    return `${this.typeInfo}:${this.label ?? '<unnamed>'}[${slot.label ?? '<unnamed>'}=${value}]`;
  }
}

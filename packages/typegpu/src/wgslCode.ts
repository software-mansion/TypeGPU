import {
  type Eventual,
  type InlineResolve,
  type ResolutionCtx,
  type SlotValuePair,
  type Wgsl,
  type WgslNamable,
  type WgslResolvable,
  type WgslSlot,
  isResolvable,
} from './types';
import { getBuiltinInfo } from './wgslBuiltin';

// ----------
// Public API
// ----------

export interface WgslCode extends WgslResolvable, WgslNamable {
  with<T>(slot: WgslSlot<T>, value: Eventual<T>): BoundWgslCode;
}

export type BoundWgslCode = Omit<WgslCode, '$name'>;

export function code(
  strings: TemplateStringsArray,
  ...params: (Wgsl | Wgsl[] | InlineResolve)[]
): WgslCode {
  const segments: (Wgsl | InlineResolve)[] = strings.flatMap((string, idx) => {
    const param = params[idx];
    if (param === undefined) {
      return [string];
    }

    return Array.isArray(param) ? [string, ...param] : [string, param];
  });

  return new WgslCodeImpl(segments);
}

// --------------
// Implementation
// --------------

class WgslCodeImpl implements WgslCode {
  private _label: string | undefined;

  constructor(public readonly segments: (Wgsl | InlineResolve)[]) {}

  get label() {
    return this._label;
  }

  $name(label?: string | undefined) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx) {
    let code = '';

    for (const s of this.segments) {
      if (typeof s === 'function') {
        const result = s((eventual) => ctx.unwrap(eventual));
        code += ctx.resolve(result);
      } else if (isResolvable(s)) {
        code += ctx.resolve(s);
      } else if (typeof s === 'symbol') {
        const builtin = getBuiltinInfo(s);
        ctx.addBuiltin(builtin);
        code += ctx.resolve(builtin.identifier);
      } else {
        code += String(s);
      }
    }

    return code;
  }

  with<TValue>(slot: WgslSlot<TValue>, value: Eventual<TValue>): BoundWgslCode {
    return new BoundWgslCodeImpl(this, [slot, value]);
  }

  toString(): string {
    return `code:${this._label ?? '<unnamed>'}`;
  }
}

class BoundWgslCodeImpl<T> implements BoundWgslCode {
  constructor(
    private readonly _innerFn: BoundWgslCode,
    private readonly _slotValuePair: SlotValuePair<T>,
  ) {}

  get label() {
    return this._innerFn.label;
  }

  with<TValue>(slot: WgslSlot<TValue>, value: Eventual<TValue>): BoundWgslCode {
    return new BoundWgslCodeImpl(this, [slot, value]);
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this._innerFn, [this._slotValuePair]);
  }

  toString(): string {
    const [slot, value] = this._slotValuePair;
    return `code:${this.label ?? '<unnamed>'}[${slot.label ?? '<unnamed>'}=${value}]`;
  }
}

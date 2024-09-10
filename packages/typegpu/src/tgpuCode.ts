import { getBuiltinInfo } from './builtin';
import {
  type BoundTgpuCode,
  type Eventual,
  type InlineResolve,
  type ResolutionCtx,
  type SlotValuePair,
  type TgpuCode,
  type TgpuSlot,
  type Wgsl,
  isResolvable,
} from './types';

// ----------
// Public API
// ----------

export function code(
  strings: TemplateStringsArray,
  ...params: (Wgsl | Wgsl[] | InlineResolve)[]
): TgpuCode {
  const segments: (Wgsl | InlineResolve)[] = strings.flatMap((string, idx) => {
    const param = params[idx];
    if (param === undefined) {
      return [string];
    }

    return Array.isArray(param) ? [string, ...param] : [string, param];
  });

  return new TgpuCodeImpl(segments);
}

// --------------
// Implementation
// --------------

class TgpuCodeImpl implements TgpuCode {
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
      if (isResolvable(s)) {
        code += ctx.resolve(s);
      } else if (typeof s === 'function') {
        const result = s((eventual) => ctx.unwrap(eventual));
        code += ctx.resolve(result);
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

  with<TValue>(slot: TgpuSlot<TValue>, value: Eventual<TValue>): BoundTgpuCode {
    return new BoundTgpuCodeImpl(this, [slot, value]);
  }

  toString(): string {
    return `code:${this._label ?? '<unnamed>'}`;
  }
}

class BoundTgpuCodeImpl<T> implements BoundTgpuCode {
  constructor(
    private readonly _innerFn: BoundTgpuCode,
    private readonly _slotValuePair: SlotValuePair<T>,
  ) {}

  get label() {
    return this._innerFn.label;
  }

  with<TValue>(slot: TgpuSlot<TValue>, value: Eventual<TValue>): BoundTgpuCode {
    return new BoundTgpuCodeImpl(this, [slot, value]);
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this._innerFn, [this._slotValuePair]);
  }

  toString(): string {
    const [slot, value] = this._slotValuePair;
    return `code:${this.label ?? '<unnamed>'}[${slot.label ?? '<unnamed>'}=${value}]`;
  }
}

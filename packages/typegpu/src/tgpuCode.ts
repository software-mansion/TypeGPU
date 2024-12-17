import type { Eventual, SlotValuePair, TgpuSlot } from './core/slot/slotTypes';
import type { TgpuNamable } from './namable';
import {
  type ResolutionCtx,
  type TgpuResolvable,
  type Wgsl,
  isResolvable,
} from './types';

// ----------
// Public API
// ----------

export interface BoundTgpuCode extends TgpuResolvable {
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): BoundTgpuCode;
}

export interface TgpuCode extends BoundTgpuCode, TgpuNamable {}

export function code(
  strings: TemplateStringsArray,
  ...params: (Wgsl | Wgsl[])[]
): TgpuCode {
  const segments: Wgsl[] = strings.flatMap((string, idx) => {
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

  constructor(public readonly segments: Wgsl[]) {}

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

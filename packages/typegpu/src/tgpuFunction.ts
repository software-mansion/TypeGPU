import type { TgpuNamable } from './namable';
import { code } from './tgpuCode';
import { TgpuIdentifier } from './tgpuIdentifier';
import type {
  Eventual,
  InlineResolve,
  ResolutionCtx,
  SlotValuePair,
  TgpuResolvable,
  TgpuSlot,
  Wgsl,
} from './types';

// ----------
// Public API
// ----------

export interface TgpuFn extends TgpuResolvable, TgpuNamable {
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): BoundTgpuFn;
}

export type BoundTgpuFn = Omit<TgpuFn, '$name'>;

export function fn(
  strings: TemplateStringsArray,
  ...params: (Wgsl | InlineResolve)[]
): TgpuFn {
  return new TgpuFnImpl(code(strings, ...params));
}

// --------------
// Implementation
// --------------

class TgpuFnImpl implements TgpuFn {
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
    const identifier = new TgpuIdentifier().$name(this._label);

    ctx.addDeclaration(code`fn ${identifier}${this.body}`.$name(this._label));

    return ctx.resolve(identifier);
  }

  with<T>(slot: TgpuSlot<T>, value: T): BoundTgpuFn {
    return new BoundTgpuFnImpl(this, [slot, value]);
  }

  toString(): string {
    return `fn:${this.label ?? '<unnamed>'}`;
  }
}

class BoundTgpuFnImpl<T> implements BoundTgpuFn {
  constructor(
    private readonly _innerFn: BoundTgpuFn,
    private readonly _slotValuePair: SlotValuePair<T>,
  ) {}

  get label() {
    return this._innerFn.label;
  }

  with<TValue>(slot: TgpuSlot<TValue>, value: Eventual<TValue>): BoundTgpuFn {
    return new BoundTgpuFnImpl(this, [slot, value]);
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this._innerFn, [this._slotValuePair]);
  }

  toString(): string {
    const [slot, value] = this._slotValuePair;
    return `fn:${this.label ?? '<unnamed>'}[${slot.label ?? '<unnamed>'}=${value}]`;
  }
}

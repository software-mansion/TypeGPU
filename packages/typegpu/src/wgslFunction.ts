import { namable, resolvable } from './decorators';
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
import { makeIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslFn extends WgslResolvable, WgslNamable {
  with<T>(slot: WgslSlot<T>, value: Eventual<T>): BoundWgslFn;
  body: Wgsl;
}

export type BoundWgslFn = Omit<WgslFn, '$name'> & {
  _innerFn: BoundWgslFn;
  _slotValuePair: SlotValuePair<unknown>;
};

export function fn(
  strings: TemplateStringsArray,
  ...params: (Wgsl | InlineResolve)[]
): WgslFn {
  return makeFn(code(strings, ...params));
}

// --------------
// Implementation
// --------------

function resolveFn(this: WgslFn, ctx: ResolutionCtx) {
  const identifier = makeIdentifier().$name(this.label);
  ctx.addDeclaration(code`fn ${identifier}${this.body}`.$name(this.label));
  return ctx.resolve(identifier);
}

const makeFn = (body: Wgsl) =>
  namable(
    resolvable(
      { typeInfo: 'fn' },
      {
        resolve: resolveFn,
        body,
        with<T>(slot: WgslSlot<T>, value: T) {
          return makeBoundFn(this as BoundWgslFn, [slot, value]);
        },
      },
    ),
  );

function resolveBoundFn(this: BoundWgslFn, ctx: ResolutionCtx) {
  return ctx.resolve(this._innerFn, [this._slotValuePair]);
}

const makeBoundFn = <T>(
  _innerFn: BoundWgslFn,
  _slotValuePair: SlotValuePair<T>,
) => ({
  _innerFn,
  _slotValuePair,

  with<TValue>(slot: WgslSlot<TValue>, value: Eventual<TValue>): BoundWgslFn {
    return makeBoundFn(this as BoundWgslFn, [slot, value]);
  },

  get label() {
    return this._innerFn.label;
  },

  get debugRepr(): string {
    const [slot, value] = this._slotValuePair;
    return `fn:${this.label ?? '<unnamed>'}[${slot.label ?? '<unnamed>'}=${value}]`;
  },

  resolve: resolveBoundFn,
  body: _innerFn.body,
});

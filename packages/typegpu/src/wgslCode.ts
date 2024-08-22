import { namable, resolvable } from './decorators';
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
  segments: (Wgsl | InlineResolve)[];
}

export type BoundWgslCode = Omit<Omit<WgslCode, '$name'>, 'segments'>;

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

  return makeCode(segments);
}

// --------------
// Implementation
// --------------

function resolveCode(this: WgslCode, ctx: ResolutionCtx) {
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

const makeCode = (segments: (Wgsl | InlineResolve)[]) =>
  namable(
    resolvable(
      { typeInfo: 'code' },
      {
        segments,
        resolve: resolveCode,
        with<TValue>(
          slot: WgslSlot<TValue>,
          value: Eventual<TValue>,
        ): BoundWgslCode {
          return makeBoundCode(this as WgslCode, [slot, value]);
        },
      },
    ),
  );

const makeBoundCode = <T>(
  _innerFn: BoundWgslCode,
  _slotValuePair: SlotValuePair<T>,
) => ({
  get label() {
    return _innerFn.label;
  },

  with<TValue>(slot: WgslSlot<TValue>, value: Eventual<TValue>): BoundWgslCode {
    return makeBoundCode(this, [slot, value]);
  },

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(_innerFn, [_slotValuePair]);
  },

  get debugRepr(): string {
    const [slot, value] = _slotValuePair;
    return `code:${this.label ?? '<unnamed>'}[${slot.label ?? '<unnamed>'}=${value}]`;
  },
});

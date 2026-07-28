import type { AnyData } from '../../data/dataTypes.ts';
import { snip } from '../../data/snippet.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { IllegalVarAccessError } from '../../errors.ts';
import { isInsideTgpuFn } from '../../execMode.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal } from '../../shared/symbols.ts';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface TgpuVar<
  TScope extends VariableScope = VariableScope,
  TDataType extends BaseData = BaseData,
> extends TgpuNamable {
  readonly resourceType: 'var';
  readonly [$gpuValueOf]: InferGPU<TDataType>;
  $: InferGPU<TDataType>;

  readonly [$internal]: {
    /** Makes it differentiable on the type level. Does not exist at runtime. */
    dataType?: TDataType;
    /** Makes it differentiable on the type level. Does not exist at runtime. */
    scope?: TScope;
  };
}

/**
 * Defines a variable scoped to each entry function (private).
 *
 * @param dataType The schema of the held data's type
 * @param initialValue If not provided, the variable will be initialized to the dataType's "zero-value".
 */
export function privateVar<TDataType extends AnyData>(
  dataType: TDataType,
  initialValue?: InferGPU<TDataType>,
): TgpuVar<'private', TDataType> {
  return new TgpuVarImpl('private', dataType, initialValue);
}

/**
 * Defines a variable scoped to the whole workgroup, shared between entry functions
 * of the same invocation.
 *
 * @param dataType The schema of the held data's type
 */
export function workgroupVar<TDataType extends AnyData>(
  dataType: TDataType,
): TgpuVar<'workgroup', TDataType> {
  return new TgpuVarImpl('workgroup', dataType);
}

export function isVariable(value: unknown): value is TgpuVar {
  return value instanceof TgpuVarImpl;
}

// --------------
// Implementation
// --------------

class TgpuVarImpl<TScope extends VariableScope, TDataType extends BaseData> implements TgpuVar<
  TScope,
  TDataType
> {
  readonly #scope: TScope;
  readonly #dataType: TDataType;
  readonly #initialValue: InferGPU<TDataType> | undefined;

  // prototype properties
  declare resourceType: 'var';
  declare [$internal]: {};
  declare $: InferGPU<TDataType>;
  declare readonly [$gpuValueOf]: InferGPU<TDataType>;

  static {
    const prototype = TgpuVarImpl.prototype as TgpuVarImpl<VariableScope, BaseData>;

    prototype.resourceType = 'var';
    prototype[$internal] = {};

    makeDereferenceable(
      makeResolvable(prototype, {
        asString() {
          return `var:${getName(this) ?? '<unnamed>'}`;
        },
        resolve(ctx) {
          const id = ctx.makeUniqueIdentifier(getName(this), 'global');
          const init = this.#initialValue
            ? snip(this.#initialValue, this.#dataType, 'constant')
            : undefined;

          return ctx.gen.declareGlobalVar({
            scope: this.#scope,
            id,
            dataType: this.#dataType,
            init,
          });
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(
              trackingProxy,
              this.#dataType,
              this.#scope,
              /* possibleSideEffects */ false,
            );
          },
        },
        simulateMode: {
          get(state) {
            if (!state.vars[this.#scope].has(this)) {
              // Not initialized yet
              state.vars[this.#scope].set(this, this.#initialValue);
            }
            return state.vars[this.#scope].get(this);
          },
          set(state, value) {
            state.vars[this.#scope].set(this, value);
          },
        },
        normalMode: {
          get() {
            throw new IllegalVarAccessError(
              isInsideTgpuFn()
                ? `Cannot access variable '${getName(this) ?? '<unnamed>'}'. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
                : 'TypeGPU variables are inaccessible during normal JS execution. If you wanted to simulate GPU behavior, try `tgpu.simulate()`',
            );
          },
          set(_value) {
            throw new IllegalVarAccessError(
              isInsideTgpuFn()
                ? `Cannot access variable ${getName(this) ?? '<unnamed>'}. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
                : 'TypeGPU variables are inaccessible during normal JS execution. If you wanted to simulate GPU behavior, try `tgpu.simulate()`',
            );
          },
        },
      },
    );
  }

  constructor(scope: TScope, dataType: TDataType, initialValue?: InferGPU<TDataType>) {
    this.#scope = scope;
    this.#dataType = dataType;
    this.#initialValue = initialValue;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }
}

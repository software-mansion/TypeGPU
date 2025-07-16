import type { AnyData } from '../../data/dataTypes.ts';
import { getExecMode } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $wgslDataType } from '../../shared/symbols.ts';
import { assertExhaustive } from '../../shared/utilityTypes.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface TgpuVar<
  TScope extends VariableScope = VariableScope,
  TDataType extends AnyData = AnyData,
> extends TgpuNamable {
  value: InferGPU<TDataType>;
  $: InferGPU<TDataType>;

  readonly [$internal]: {
    readonly scope: TScope;
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

export function isVariable<T extends TgpuVar>(
  value: T | unknown,
): value is T {
  return value instanceof TgpuVarImpl;
}

// --------------
// Implementation
// --------------

class TgpuVarImpl<TScope extends VariableScope, TDataType extends AnyData>
  implements TgpuVar<TScope, TDataType>, SelfResolvable {
  declare readonly [$internal]: {
    // TODO: Maybe unnecessary?
    readonly scope: TScope;
  };

  readonly #scope: TScope;
  readonly #dataType: TDataType;
  readonly #initialValue: InferGPU<TDataType> | undefined;

  constructor(
    scope: TScope,
    dataType: TDataType,
    initialValue?: InferGPU<TDataType> | undefined,
  ) {
    this.#scope = scope;
    this.#dataType = dataType;
    this.#initialValue = initialValue;
    this[$internal] = { scope };
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));

    if (this.#initialValue) {
      ctx.addDeclaration(
        `var<${this.#scope}> ${id}: ${ctx.resolve(this.#dataType)} = ${
          ctx.resolveValue(this.#initialValue, this.#dataType)
        };`,
      );
    } else {
      ctx.addDeclaration(
        `var<${this.#scope}> ${id}: ${ctx.resolve(this.#dataType)};`,
      );
    }

    return id;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  toString() {
    return `var:${getName(this) ?? '<unnamed>'}`;
  }

  [$gpuValueOf](): InferGPU<TDataType> {
    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
        [$wgslDataType]: this.#dataType,
      },
      valueProxyHandler,
    ) as InferGPU<TDataType>;
  }

  get $(): InferGPU<TDataType> {
    const mode = getExecMode();
    if (!mode) {
      // TODO: Add stable doc links
      throw new Error(
        'Cannot call functions that read TypeGPU variables (tgpu.privateVar/tgpu.workgroupVar) top-level (see https://docs.swmansion.com/TypeGPU/error?code=123)',
      );
    }
    if (mode.type === 'codegen') {
      return this[$gpuValueOf]();
    }
    if (mode.type === 'simulate') {
      if (!mode.varValueMap.has(this)) { // Not initialized yet
        mode.varValueMap.set(this, this.#initialValue);
      }
      return mode.varValueMap.get(this) as InferGPU<TDataType>;
    }
    if (mode.type === 'comptime') {
      throw new Error(
        'Cannot access TypeGPU variables when executing code at compile-time',
      );
    }
    return assertExhaustive(
      mode,
      'tgpuVariable.ts#TgpuVarImpl/$',
    );
  }

  set $(value: InferGPU<TDataType>) {
    const mode = getExecMode();
    if (!mode) {
      // TODO: Add stable doc links
      throw new Error(
        'Cannot call functions that write to TypeGPU variables (tgpu.privateVar/tgpu.workgroupVar) top-level (see https://docs.swmansion.com/TypeGPU/error?code=123)',
      );
    }
    if (mode.type === 'codegen') {
      // The WGSL generator handles variable assignment, and does not defer to
      // whatever's being assigned to to generate the WGSL.
      throw new Error('Unreachable tgpuVariable.ts#TgpuVarImpl/$');
    }
    if (mode.type === 'simulate') {
      mode.varValueMap.set(this, value);
      return;
    }
    if (mode.type === 'comptime') {
      throw new Error(
        'Cannot access TypeGPU variables when executing code at compile-time',
      );
    }
    assertExhaustive(mode, 'tgpuVariable.ts#TgpuVarImpl/$');
  }

  get value(): InferGPU<TDataType> {
    return this.$;
  }

  set value(v: InferGPU<TDataType>) {
    this.$ = v;
  }
}

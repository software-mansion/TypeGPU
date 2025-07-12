import type { AnyData } from '../../data/dataTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $wgslDataType } from '../../shared/symbols.ts';
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
  initialValue?: Infer<TDataType>,
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
    readonly scope: TScope;
  };

  constructor(
    readonly scope: TScope,
    private readonly _dataType: TDataType,
    private readonly _initialValue?: Infer<TDataType> | undefined,
  ) {
    this[$internal] = { scope };
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));

    if (this._initialValue) {
      ctx.addDeclaration(
        `var<${this.scope}> ${id}: ${ctx.resolve(this._dataType)} = ${
          ctx.resolveValue(this._initialValue, this._dataType)
        };`,
      );
    } else {
      ctx.addDeclaration(
        `var<${this.scope}> ${id}: ${ctx.resolve(this._dataType)};`,
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
        [$wgslDataType]: this._dataType,
      },
      valueProxyHandler,
    ) as InferGPU<TDataType>;
  }

  get $(): InferGPU<TDataType> {
    if (inCodegenMode()) {
      return this[$gpuValueOf]();
    }

    throw new Error(
      '`tgpu.var` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call',
    );
  }

  get value(): InferGPU<TDataType> {
    if (inCodegenMode()) {
      return this[$gpuValueOf]();
    }

    throw new Error(
      '`tgpu.var` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call',
    );
  }
}

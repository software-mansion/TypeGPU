import type { AnyWgslData } from '../../data/wgslTypes';
import { inGPUMode } from '../../gpuMode';
import type { TgpuNamable } from '../../namable';
import type { Infer } from '../../shared/repr';
import type { ResolutionCtx, TgpuResolvable } from '../../types';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface TgpuVar<TDataType extends AnyWgslData>
  extends TgpuResolvable,
    TgpuNamable {
  value: Infer<TDataType>;
  readonly scope: VariableScope;
}

export interface TgpuVarUninitialized<TDataType extends AnyWgslData>
  extends TgpuVar<TDataType> {
  $scope(scope: VariableScope): this;
}

export function variable<TDataType extends AnyWgslData>(
  dataType: TDataType,
): TgpuVarUninitialized<TDataType>;

export function variable<TDataType extends AnyWgslData>(
  dataType: TDataType,
  initialValue: Infer<TDataType>,
): TgpuVar<TDataType>;

/**
 * Creates a module variable with an optional initial value.
 */
export function variable<TDataType extends AnyWgslData>(
  dataType: TDataType,
  initialValue?: Infer<TDataType>,
): TgpuVar<TDataType> {
  return new TgpuVarImpl(dataType, initialValue);
}

// --------------
// Implementation
// --------------

class TgpuVarImpl<TDataType extends AnyWgslData> implements TgpuVar<TDataType> {
  private _label: string | undefined;
  private _scope: VariableScope = 'private';

  get scope() {
    return this._scope;
  }

  constructor(
    private readonly _dataType: TDataType,
    private readonly _initialValue: Infer<TDataType> | undefined,
  ) {}

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this._label);

    if (this._initialValue) {
      ctx.addDeclaration(
        `var<${this._scope}> ${id}: ${ctx.resolve(this._dataType)} = ${ctx.resolveValue(this._initialValue, this._dataType)};`,
      );
    } else {
      ctx.addDeclaration(
        `var<${this._scope}> ${id}: ${ctx.resolve(this._dataType)};`,
      );
    }

    return id;
  }

  $scope(scope: VariableScope) {
    if (this._initialValue !== undefined && scope !== 'private') {
      throw new Error(
        "Initialized module variables can only be of scope 'private'.",
      );
    }
    this._scope = scope;
    return this;
  }

  get value(): Infer<TDataType> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access tgpu.var's value directly in JS.`);
    }
    return this as Infer<TDataType>;
  }
}

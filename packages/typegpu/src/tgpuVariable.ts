import type { Unwrap } from 'typed-binary';
import { inGPUMode } from './gpuMode';
import type { TgpuNamable } from './namable';
import type { AnyTgpuData, ResolutionCtx, TgpuResolvable, Wgsl } from './types';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface TgpuVar<TDataType extends AnyTgpuData>
  extends TgpuResolvable,
    TgpuNamable {
  value: Unwrap<TDataType>;
}

/**
 * Creates a variable, with an optional initial value.
 */
export const variable = <TDataType extends AnyTgpuData>(
  dataType: TDataType,
  initialValue?: Wgsl,
  scope: VariableScope = 'private',
): TgpuVar<TDataType> => new TgpuVarImpl(dataType, initialValue, scope);

// --------------
// Implementation
// --------------

class TgpuVarImpl<TDataType extends AnyTgpuData> implements TgpuVar<TDataType> {
  private _label: string | undefined;

  constructor(
    private readonly _dataType: TDataType,
    private readonly _initialValue: Wgsl | undefined,
    public readonly scope: VariableScope,
  ) {}

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this._label);

    if (this._initialValue) {
      ctx.addDeclaration(
        `var<${this.scope}> ${id}: ${ctx.resolve(this._dataType)} = ${ctx.resolve(this._initialValue)};`,
      );
    } else {
      ctx.addDeclaration(
        `var<${this.scope}> ${id}: ${ctx.resolve(this._dataType)};`,
      );
    }

    return id;
  }

  get value(): Unwrap<TDataType> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access wgsl.var's value directly in JS.`);
    }
    return this as Unwrap<TDataType>;
  }
}

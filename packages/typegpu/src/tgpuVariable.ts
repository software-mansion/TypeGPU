import { resolveData } from './core/resolve/resolveData';
import type { AnyWgslData } from './data/wgslTypes';
import { inGPUMode } from './gpuMode';
import type { TgpuNamable } from './namable';
import type { Infer } from './shared/repr';
import type { ResolutionCtx, TgpuResolvable, Wgsl } from './types';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface TgpuVar<TDataType extends AnyWgslData>
  extends TgpuResolvable,
    TgpuNamable {
  value: Infer<TDataType>;
}

/**
 * Creates a variable, with an optional initial value.
 */
export const variable = <TDataType extends AnyWgslData>(
  dataType: TDataType,
  initialValue?: Wgsl,
  scope: VariableScope = 'private',
): TgpuVar<TDataType> => new TgpuVarImpl(dataType, initialValue, scope);

// --------------
// Implementation
// --------------

class TgpuVarImpl<TDataType extends AnyWgslData> implements TgpuVar<TDataType> {
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
        `var<${this.scope}> ${id}: ${resolveData(ctx, this._dataType)} = ${ctx.resolve(this._initialValue)};`,
      );
    } else {
      ctx.addDeclaration(
        `var<${this.scope}> ${id}: ${resolveData(ctx, this._dataType)};`,
      );
    }

    return id;
  }

  get value(): Infer<TDataType> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access wgsl.var's value directly in JS.`);
    }
    return this as Infer<TDataType>;
  }
}

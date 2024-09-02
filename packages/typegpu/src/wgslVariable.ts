import type {
  AnyTgpuData,
  ResolutionCtx,
  Tgpu,
  TgpuNamable,
  TgpuResolvable,
} from './types';
import { code } from './wgslCode';
import { TgpuIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface TgpuVar<TDataType extends AnyTgpuData>
  extends TgpuResolvable,
    TgpuNamable {}

/**
 * Creates a variable, with an optional initial value.
 */
export const variable = <TDataType extends AnyTgpuData>(
  dataType: TDataType,
  initialValue?: Tgpu,
  scope: VariableScope = 'private',
): TgpuVar<TDataType> => new TgpuVarImpl(dataType, initialValue, scope);

// --------------
// Implementation
// --------------

class TgpuVarImpl<TDataType extends AnyTgpuData> implements TgpuVar<TDataType> {
  public identifier = new TgpuIdentifier();

  constructor(
    private readonly _dataType: TDataType,
    private readonly _initialValue: Tgpu | undefined,
    public readonly scope: VariableScope,
  ) {}

  $name(label: string) {
    this.identifier.$name(label);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    if (this._initialValue) {
      ctx.addDeclaration(
        code`var<${this.scope}> ${this.identifier}: ${this._dataType} = ${this._initialValue};`,
      );
    } else {
      ctx.addDeclaration(
        code`var<${this.scope}> ${this.identifier}: ${this._dataType};`,
      );
    }

    return ctx.resolve(this.identifier);
  }
}

import type {
  AnyWgslData,
  ResolutionCtx,
  Wgsl,
  WgslNamable,
  WgslResolvable,
} from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface WgslVar<TDataType extends AnyWgslData>
  extends WgslResolvable,
    WgslNamable {}

/**
 * Creates a variable, with an optional initial value.
 */
export const variable = <TDataType extends AnyWgslData>(
  dataType: TDataType,
  initialValue?: Wgsl,
  scope: VariableScope = 'private',
): WgslVar<TDataType> => new WgslVarImpl(dataType, initialValue, scope);

// --------------
// Implementation
// --------------

class WgslVarImpl<TDataType extends AnyWgslData> implements WgslVar<TDataType> {
  public identifier = new WgslIdentifier();

  constructor(
    private readonly _dataType: TDataType,
    private readonly _initialValue: Wgsl | undefined,
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

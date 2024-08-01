import type {
  AnyWgslData,
  ResolutionCtx,
  Wgsl,
  WgslNamable,
  WgslResolvable,
} from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';
import { WgslResolvableBase } from './wgslResolvableBase';

// ----------
// Public API
// ----------

export type VariableScope = 'private';

export interface WgslVar<TDataType extends AnyWgslData>
  extends WgslResolvable,
    WgslNamable {}

/**
 * Creates a variable, with an optional initial value.
 */
export const variable = <TDataType extends AnyWgslData>(
  dataType: TDataType,
  initialValue?: Wgsl,
): WgslVar<TDataType> => new WgslVarImpl(dataType, initialValue, 'private');

// --------------
// Implementation
// --------------

class WgslVarImpl<TDataType extends AnyWgslData>
  extends WgslResolvableBase
  implements WgslVar<TDataType>
{
  readonly typeInfo = 'var';

  constructor(
    private readonly _dataType: TDataType,
    private readonly _initialValue: Wgsl | undefined,
    public readonly scope: VariableScope,
  ) {
    super();
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier();
    if (this._initialValue) {
      ctx.addDeclaration(
        code`var<${this.scope}> ${identifier}: ${this._dataType} = ${this._initialValue};`,
      );
    } else {
      ctx.addDeclaration(
        code`var<${this.scope}> ${identifier}: ${this._dataType};`,
      );
    }

    return ctx.resolve(identifier);
  }
}

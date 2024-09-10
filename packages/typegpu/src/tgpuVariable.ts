import type { TgpuNamable } from './namable';
import { code } from './tgpuCode';
import { identifier } from './tgpuIdentifier';
import type { AnyTgpuData, ResolutionCtx, TgpuResolvable, Wgsl } from './types';

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
    const ident = identifier().$name(this._label);

    if (this._initialValue) {
      ctx.addDeclaration(
        code`var<${this.scope}> ${ident}: ${this._dataType} = ${this._initialValue};`,
      );
    } else {
      ctx.addDeclaration(code`var<${this.scope}> ${ident}: ${this._dataType};`);
    }

    return ctx.resolve(ident);
  }
}

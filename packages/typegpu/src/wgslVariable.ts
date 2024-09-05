import type { Unwrap } from 'typed-binary';
import { inGPUMode } from './gpuMode';
import type {
  AnyTgpuData,
  ResolutionCtx,
  TgpuNamable,
  TgpuResolvable,
  Wgsl,
} from './types';
import { code } from './wgslCode';
import { TgpuIdentifier } from './wgslIdentifier';

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
  public identifier = new TgpuIdentifier();

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

  get value(): Unwrap<TDataType> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access wgsl.var's value directly in JS.`);
    }
    return this as Unwrap<TDataType>;
  }
}

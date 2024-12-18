import type { Infer } from '../../data';
import type { Exotic } from '../../data/exotic';
import type { AnyWgslData } from '../../data/wgslTypes';
import { inGPUMode } from '../../gpuMode';
import type { TgpuNamable } from '../../namable';
import type { ResolutionCtx, TgpuResolvable } from '../../types';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface TgpuVar<
  TScope extends VariableScope,
  TDataType extends AnyWgslData,
> extends TgpuResolvable,
    TgpuNamable {
  value: Infer<TDataType>;
  readonly scope: TScope;
}

/**
 * Creates a private module variable with an optional initial value.
 */
export function privateVar<TDataType extends AnyWgslData>(
  dataType: Exotic<TDataType>,
  initialValue?: Infer<Exotic<TDataType>>,
): TgpuVar<'private', Exotic<TDataType>> {
  return new TgpuVarImpl('private', dataType, initialValue);
}

/**
 * Creates a workgroup module variable with an optional initial value.
 */
export function workgroupVar<TDataType extends AnyWgslData>(
  dataType: TDataType,
): TgpuVar<'workgroup', TDataType> {
  return new TgpuVarImpl('workgroup', dataType);
}

// --------------
// Implementation
// --------------

class TgpuVarImpl<TScope extends VariableScope, TDataType extends AnyWgslData>
  implements TgpuVar<TScope, TDataType>
{
  private _label: string | undefined;

  constructor(
    readonly scope: TScope,
    private readonly _dataType: TDataType,
    private readonly _initialValue?: Infer<TDataType> | undefined,
  ) {}

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this._label);

    if (this._initialValue) {
      ctx.addDeclaration(
        `var<${this.scope}> ${id}: ${ctx.resolve(this._dataType)} = ${ctx.resolveValue(this._initialValue, this._dataType)};`,
      );
    } else {
      ctx.addDeclaration(
        `var<${this.scope}> ${id}: ${ctx.resolve(this._dataType)};`,
      );
    }

    return id;
  }

  get value(): Infer<TDataType> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access tgpu.var's value directly in JS.`);
    }
    return this as Infer<TDataType>;
  }
}

import type { AnyWgslData } from '../../data/wgslTypes';
import { inGPUMode } from '../../gpuMode';
import type { TgpuNamable } from '../../namable';
import type { Infer } from '../../shared/repr';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import type { Exotic } from './../../data/exotic';

// ----------
// Public API
// ----------

export interface TgpuConst<TDataType extends AnyWgslData>
  extends TgpuResolvable,
    TgpuNamable {
  readonly dataType: TDataType;
  readonly value: Infer<TDataType>;
}

/**
 * Creates a module constant with specified value.
 */
export function constant<TDataType extends AnyWgslData>(
  dataType: Exotic<TDataType>,
  value: Infer<Exotic<TDataType>>,
): TgpuConst<Exotic<TDataType>> {
  return new TgpuConstImpl(dataType, value);
}

// --------------
// Implementation
// --------------

class TgpuConstImpl<TDataType extends AnyWgslData>
  implements TgpuConst<TDataType>
{
  private _label: string | undefined;

  constructor(
    public readonly dataType: TDataType,
    private readonly _value: Infer<TDataType>,
  ) {}

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this._label);
    const resolvedValue = ctx.resolveValue(this._value, this.dataType);

    ctx.addDeclaration(`const ${id} = ${resolvedValue};`);

    return id;
  }

  get value(): Infer<TDataType> {
    if (!inGPUMode()) {
      return this._value;
    }
    return this as Infer<TDataType>;
  }
}

import type { AnyWgslData } from '../../data/wgslTypes';
import { inGPUMode } from '../../gpuMode';
import type { TgpuNamable } from '../../namable';
import type { Infer } from '../../shared/repr';
import { $internal } from '../../shared/symbols';
import type { ResolutionCtx, SelfResolvable } from '../../types';
import { valueProxyHandler } from '../valueProxyUtils';

// ----------
// Public API
// ----------

export interface TgpuConst<TDataType extends AnyWgslData = AnyWgslData>
  extends TgpuNamable {
  readonly value: Infer<TDataType>;

  readonly [$internal]: {
    readonly dataType: TDataType;
  };
}

/**
 * Creates a module constant with specified value.
 */
export function constant<TDataType extends AnyWgslData>(
  dataType: TDataType,
  value: Infer<TDataType>,
): TgpuConst<TDataType> {
  return new TgpuConstImpl(dataType, value);
}

// --------------
// Implementation
// --------------

class TgpuConstImpl<TDataType extends AnyWgslData>
  implements TgpuConst<TDataType>, SelfResolvable
{
  private _label: string | undefined;
  public readonly [$internal]: {
    readonly dataType: TDataType;
  };

  constructor(
    public readonly dataType: TDataType,
    private readonly _value: Infer<TDataType>,
  ) {
    this[$internal] = { dataType };
  }

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this._label);
    const resolvedValue = ctx.resolveValue(this._value, this.dataType);

    ctx.addDeclaration(`const ${id} = ${resolvedValue};`);

    return id;
  }

  toString() {
    return `const:${this.label ?? '<unnamed>'}`;
  }

  get value(): Infer<TDataType> {
    if (!inGPUMode()) {
      return this._value;
    }

    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${this.label ?? '<unnamed>'}`,
        [$internal]: {
          dataType: this.dataType,
        },
      },
      valueProxyHandler,
    ) as Infer<TDataType>;
  }
}

import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { inGPUMode } from '../../gpuMode.ts';
import type { TgpuNamable } from '../../namable.ts';
import type { Infer } from '../../shared/repr.ts';
import { $internal } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

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
  implements TgpuConst<TDataType>, SelfResolvable {
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

import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $wgslDataType } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

// ----------
// Public API
// ----------

export interface TgpuConst<TDataType extends AnyWgslData = AnyWgslData>
  extends TgpuNamable {
  readonly value: InferGPU<TDataType>;
  readonly $: InferGPU<TDataType>;

  readonly [$internal]: {
    readonly dataType: TDataType;
  };
}

/**
 * Creates a module constant with specified value.
 */
export function constant<TDataType extends AnyWgslData>(
  dataType: TDataType,
  value: InferGPU<TDataType>,
): TgpuConst<TDataType> {
  return new TgpuConstImpl(dataType, value);
}

// --------------
// Implementation
// --------------

class TgpuConstImpl<TDataType extends AnyWgslData>
  implements TgpuConst<TDataType>, SelfResolvable {
  public readonly [$internal]: {
    readonly dataType: TDataType;
  };

  constructor(
    public readonly dataType: TDataType,
    private readonly _value: InferGPU<TDataType>,
  ) {
    this[$internal] = { dataType };
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const resolvedValue = ctx.resolveValue(this._value, this.dataType);
    const resolvedDataType = ctx.resolve(this.dataType);

    ctx.addDeclaration(`const ${id}: ${resolvedDataType} = ${resolvedValue};`);

    return id;
  }

  toString() {
    return `const:${getName(this) ?? '<unnamed>'}`;
  }

  [$gpuValueOf](): InferGPU<TDataType> {
    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
        [$wgslDataType]: this.dataType,
      },
      valueProxyHandler,
    ) as InferGPU<TDataType>;
  }

  get value(): InferGPU<TDataType> {
    if (inCodegenMode()) {
      return this[$gpuValueOf]();
    }

    return this._value;
  }

  get $(): InferGPU<TDataType> {
    return this.value;
  }
}

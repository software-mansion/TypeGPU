import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import {
  $gpuValueOf,
  $internal,
  $runtimeResource,
  $wgslDataType,
} from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

// ----------
// Public API
// ----------

export interface TgpuConst<TDataType extends AnyWgslData = AnyWgslData>
  extends TgpuNamable {
  [$gpuValueOf](): InferGPU<TDataType>;
  readonly value: InferGPU<TDataType>;
  readonly $: InferGPU<TDataType>;

  readonly [$internal]: {
    /** Makes it differentiable on the type level. Does not exist at runtime. */
    dataType?: TDataType;
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
  readonly [$internal] = {};
  #value: InferGPU<TDataType>;

  constructor(
    public readonly dataType: TDataType,
    value: InferGPU<TDataType>,
  ) {
    this.#value = value;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const resolvedValue = ctx.resolve(this.#value, this.dataType);
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
        [$internal]: true,
        [$runtimeResource]: true,
        [$wgslDataType]: this.dataType,
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
      },
      valueProxyHandler,
    ) as InferGPU<TDataType>;
  }

  get value(): InferGPU<TDataType> {
    if (inCodegenMode()) {
      return this[$gpuValueOf]();
    }

    return this.#value;
  }

  get $(): InferGPU<TDataType> {
    return this.value;
  }
}

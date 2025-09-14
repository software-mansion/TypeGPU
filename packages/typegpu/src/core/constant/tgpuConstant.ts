import { snip, type Snippet } from '../../data/snippet.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import {
  $gpuValueOf,
  $internal,
  $resolve,
  $runtimeResource,
} from '../../shared/symbols.ts';
import type { ResolutionCtx } from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

// ----------
// Public API
// ----------

export interface TgpuConst<TDataType extends AnyWgslData = AnyWgslData>
  extends TgpuNamable {
  readonly [$gpuValueOf]: InferGPU<TDataType>;
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
  readonly #value: InferGPU<TDataType>;
  readonly [$gpuValueOf]: InferGPU<TDataType>;

  constructor(
    public readonly dataType: TDataType,
    value: InferGPU<TDataType>,
  ) {
    this.#value = value;
    this[$gpuValueOf] = snip(
      new Proxy({
        [$internal]: true,
        [$runtimeResource]: true,
        resourceType: 'access-proxy',

        [$resolve]: (ctx: ResolutionCtx) => {
          const id = ctx.names.makeUnique(getName(this));
          const resolvedValue = ctx.resolve(value, dataType);
          const resolvedDataType = ctx.resolve(dataType);

          ctx.addDeclaration(
            `const ${id}: ${resolvedDataType} = ${resolvedValue};`,
          );

          return id;
        },
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
      }, valueProxyHandler(dataType)),
      dataType,
    ) as InferGPU<TDataType>;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  toString() {
    return `const:${getName(this) ?? '<unnamed>'}`;
  }

  get value(): InferGPU<TDataType> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    return this.#value;
  }

  get $(): InferGPU<TDataType> {
    return this.value;
  }

  [$resolve](ctx: ResolutionCtx) {
    const snippet = this[$gpuValueOf] as Snippet;
    return ctx.resolve(snippet.value, this.dataType);
  }
}

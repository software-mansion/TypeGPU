import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { type AnyWgslData, isNaturallyRef } from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import {
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $resolve,
} from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

// ----------
// Public API
// ----------

type DeepReadonly<T> = T extends { [$internal]: unknown } ? T
  : T extends unknown[] ? ReadonlyArray<DeepReadonly<T[number]>>
  : T extends Record<string, unknown>
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export interface TgpuConst<TDataType extends AnyWgslData = AnyWgslData>
  extends TgpuNamable {
  readonly [$gpuValueOf]: InferGPU<TDataType>;
  readonly value: DeepReadonly<InferGPU<TDataType>>;
  readonly $: DeepReadonly<InferGPU<TDataType>>;

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

function deepFreeze<T extends object>(object: T): T {
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    // biome-ignore lint/suspicious/noExplicitAny: chill TypeScript
    const value = (object as any)[name];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}

class TgpuConstImpl<TDataType extends AnyWgslData>
  implements TgpuConst<TDataType>, SelfResolvable {
  readonly [$internal] = {};
  readonly #value: InferGPU<TDataType>;

  constructor(
    public readonly dataType: TDataType,
    value: InferGPU<TDataType>,
  ) {
    this.#value = value && typeof value === 'object'
      ? deepFreeze(value)
      : value;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.getUniqueName(this);
    const resolvedDataType = ctx.resolve(this.dataType).value;
    const resolvedValue = ctx.resolve(this.#value, this.dataType).value;

    ctx.addDeclaration(`const ${id}: ${resolvedDataType} = ${resolvedValue};`);

    // Why not a ref?
    // 1. On the WGSL side, we cannot take pointers to constants.
    // 2. On the JS side, we copy the constant each time we access it, so we're safe.
    return snip(
      id,
      this.dataType,
      /* ref */ isNaturallyRef(this.dataType) ? 'constant-ref' : 'constant',
    );
  }

  toString() {
    return `const:${getName(this) ?? '<unnamed>'}`;
  }

  get [$gpuValueOf](): InferGPU<TDataType> {
    const dataType = this.dataType;

    return new Proxy({
      [$internal]: true,
      get [$ownSnippet]() {
        return snip(
          this,
          dataType,
          /* ref */ isNaturallyRef(dataType) ? 'constant-ref' : 'constant',
        );
      },
      [$resolve]: (ctx) => ctx.resolve(this),
      toString: () => `const:${getName(this) ?? '<unnamed>'}.$`,
    }, valueProxyHandler) as InferGPU<TDataType>;
  }

  get $(): InferGPU<TDataType> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    return this.#value;
  }

  get value(): InferGPU<TDataType> {
    return this.$;
  }
}

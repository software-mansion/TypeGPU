import { type AnyData, isData } from '../../data/dataTypes.ts';
import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { isSnippet, type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { getResolutionCtx, inCodegenMode } from '../../execMode.ts';
import { getName, hasTinyestMetadata, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $resolve,
} from '../../shared/symbols.ts';
import type { UnwrapRuntimeConstructor } from '../../tgpuBindGroupLayout.ts';
import {
  getOwnSnippet,
  NormalState,
  type ResolutionCtx,
  type SelfResolvable,
} from '../../types.ts';
import { isTgpuFn } from '../function/tgpuFn.ts';
import { getGpuValueRecursively, valueProxyHandler } from '../valueProxyUtils.ts';
import { slot as slotConstructor } from './slot.ts';
import type { TgpuAccessor, TgpuMutableAccessor, TgpuSlot } from './slotTypes.ts';

// ----------
// Public API
// ----------
export function accessor<T extends AnyData | ((count: number) => AnyData)>(
  schemaOrConstructor: T,
  defaultValue?: TgpuAccessor.In<NoInfer<T>>,
): TgpuAccessor<UnwrapRuntimeConstructor<T>> {
  return new TgpuAccessorImpl(schemaOrConstructor, defaultValue) as unknown as TgpuAccessor<
    UnwrapRuntimeConstructor<T>
  >;
}

export function mutableAccessor<T extends AnyData | ((count: number) => AnyData)>(
  schemaOrConstructor: T,
  defaultValue?: TgpuMutableAccessor.In<NoInfer<T>>,
): TgpuMutableAccessor<UnwrapRuntimeConstructor<T>> {
  return new TgpuMutableAccessorImpl(
    schemaOrConstructor,
    defaultValue as TgpuMutableAccessor.In<BaseData>,
  ) as unknown as TgpuMutableAccessor<UnwrapRuntimeConstructor<T>>;
}

// --------------
// Implementation
// --------------

abstract class AccessorBase<
  T extends BaseData,
  TValue extends TgpuAccessor.In<T> | TgpuMutableAccessor.In<T>,
> implements SelfResolvable {
  readonly [$internal] = true;
  readonly [$getNameForward]: unknown;
  readonly slot: TgpuSlot<TValue>;
  readonly schema: T;
  readonly defaultValue: TValue | undefined;

  abstract readonly resourceType: string;

  constructor(
    schemaOrConstructor: T | ((count: number) => T),
    defaultValue: TValue | undefined = undefined,
  ) {
    this.schema = isData(schemaOrConstructor)
      ? schemaOrConstructor
      : (schemaOrConstructor as (count: number) => T)(0);
    this.defaultValue = defaultValue;

    // NOTE: in certain setups, unplugin can run on package typegpu, so we have to avoid auto-naming triggering here
    this.slot = slotConstructor(defaultValue);
    this[$getNameForward] = this.slot;
  }

  get [$gpuValueOf](): InferGPU<T> {
    return new Proxy(
      {
        [$internal]: true,
        [$ownSnippet]: this.#createSnippet(),
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `${this.resourceType}:${getName(this) ?? '<unnamed>'}.$`,
      },
      valueProxyHandler,
    ) as InferGPU<T>;
  }

  /**
   * @returns A snippet representing the accessor.
   */
  #createSnippet() {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- it's there
    const ctx = getResolutionCtx()!;
    let value = getGpuValueRecursively(ctx.unwrap(this.slot));

    while (typeof value === 'function' && !isTgpuFn(value) && !hasTinyestMetadata(value)) {
      // Not a GPU function, so has to be a resource accessor (ran in codegen mode) or comptime
      value = value();
      if (isSnippet(value)) {
        value = value.value;
      }
    }

    const ownSnippet = getOwnSnippet(value);
    if (ownSnippet) {
      return ownSnippet;
    }

    if (isTgpuFn(value) || hasTinyestMetadata(value)) {
      return ctx.withResetIndentLevel(() =>
        snip(`${ctx.resolve(value).value}()`, this.schema, /* origin */ 'runtime'),
      );
    }

    ctx.pushMode(new NormalState());
    try {
      // Doing a deep copy each time so that we don't have to deal with refs
      const cloned = schemaCallWrapper(this.schema, value);
      return snip(cloned, this.schema, 'constant');
    } finally {
      ctx.popMode('normal');
    }
  }

  $name(label: string) {
    setName(this, label);

    // Passing the name down to the default callback, if it has no name yet
    if (
      this.defaultValue &&
      typeof this.defaultValue === 'function' &&
      !getName(this.defaultValue)
    ) {
      setName(this.defaultValue as object, label);
    }

    return this;
  }

  toString(): string {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }

  abstract readonly $: InferGPU<T>;

  get value(): InferGPU<T> {
    return this.$;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const snippet = this.#createSnippet();
    return snip(
      ctx.resolve(snippet.value, snippet.dataType).value,
      snippet.dataType as T,
      snippet.origin,
    );
  }
}

export class TgpuAccessorImpl<T extends BaseData>
  extends AccessorBase<T, TgpuAccessor.In<T>>
  implements TgpuAccessor<T>
{
  readonly resourceType = 'accessor';

  constructor(
    schemaOrConstructor: T | ((count: number) => T),
    defaultValue: TgpuAccessor.In<T> | undefined = undefined,
  ) {
    super(schemaOrConstructor, defaultValue);
  }

  get $(): InferGPU<T> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      '`tgpu.accessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call',
    );
  }
}

export class TgpuMutableAccessorImpl<T extends BaseData>
  extends AccessorBase<T, TgpuMutableAccessor.In<T>>
  implements TgpuMutableAccessor<T>
{
  readonly resourceType = 'mutable-accessor';

  constructor(
    schemaOrConstructor: T | ((count: number) => T),
    defaultValue: TgpuMutableAccessor.In<T> | undefined = undefined,
  ) {
    super(schemaOrConstructor, defaultValue);
  }

  get $(): InferGPU<T> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      '`tgpu.mutableAccessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call',
    );
  }
}

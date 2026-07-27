import { type AnyData, isData } from '../../data/dataTypes.ts';
import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { isSnippet, type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { getResolutionCtx } from '../../execMode.ts';
import { makeDereferenceable } from '../../internal.ts';
import { getName, hasTinyestMetadata, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuCallable,
  $gpuValueOf,
  $internal,
  $resolve,
} from '../../shared/symbols.ts';
import type { UnwrapRuntimeConstructor } from '../../tgpuBindGroupLayout.ts';
import {
  getOwnSnippet,
  isGPUCallable,
  NormalState,
  type ResolutionCtx,
  type SelfResolvable,
} from '../../types.ts';
import { isTgpuFn } from '../function/tgpuFn.ts';
import { getGpuValueRecursively } from '../valueProxyUtils.ts';
import { slot } from './slot.ts';
import type { TgpuAccessor, TgpuMutableAccessor, TgpuSlot } from './slotTypes.ts';

// ----------
// Public API
// ----------
export function accessor<T extends AnyData>(
  schema: T,
  defaultValue?: TgpuAccessor.In<NoInfer<T>>,
): TgpuAccessor<UnwrapRuntimeConstructor<T>>;
export function accessor<T extends (count: number) => AnyData>(
  schema: T,
  defaultValue?: TgpuAccessor.In<NoInfer<T>>,
): TgpuAccessor<UnwrapRuntimeConstructor<T>>;
export function accessor<T extends AnyData | ((count: number) => AnyData)>(
  schemaOrConstructor: T,
  defaultValue?: TgpuAccessor.In<NoInfer<T>>,
): TgpuAccessor<UnwrapRuntimeConstructor<T>> {
  return new TgpuAccessorImpl(schemaOrConstructor, defaultValue) as unknown as TgpuAccessor<
    UnwrapRuntimeConstructor<T>
  >;
}

export function mutableAccessor<T extends AnyData>(
  schema: T,
  defaultValue?: TgpuMutableAccessor.In<NoInfer<T>>,
): TgpuMutableAccessor<UnwrapRuntimeConstructor<T>>;
export function mutableAccessor<T extends (count: number) => AnyData>(
  schema: T,
  defaultValue?: TgpuMutableAccessor.In<NoInfer<T>>,
): TgpuMutableAccessor<UnwrapRuntimeConstructor<T>>;
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

/**
 * @returns A snippet representing the accessor.
 */
function createAccessorSnippet(accessor: AccessorBase<BaseData, unknown>) {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- it's there
  const ctx = getResolutionCtx()!;
  let value = getGpuValueRecursively(ctx.unwrap(accessor.slot));

  while (
    typeof value === 'function' &&
    !isTgpuFn(value) &&
    !isGPUCallable(value) &&
    !hasTinyestMetadata(value)
  ) {
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

  if (isGPUCallable(value)) {
    return value[$gpuCallable].call(ctx, []);
  }

  if (isTgpuFn(value) || hasTinyestMetadata(value)) {
    const fn = ctx.resolve(value);
    return ctx.withResetIndentLevel(() =>
      snip(`${fn.value}()`, accessor.schema, /* origin */ 'runtime', fn.possibleSideEffects),
    );
  }

  ctx.pushMode(new NormalState());
  try {
    // Doing a deep copy each time so that we don't have to deal with refs
    const cloned = schemaCallWrapper(accessor.schema, value);
    return snip(cloned, accessor.schema, 'constant', /* possibleSideEffects */ false);
  } finally {
    ctx.popMode('normal');
  }
}

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
    this.slot = (() => slot(defaultValue))();
    this[$getNameForward] = this.slot;
  }

  declare readonly [$gpuValueOf]: InferGPU<T>;
  abstract readonly $: InferGPU<T>;

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

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return ctx.resolveSnippet(createAccessorSnippet(this));
  }
}

export class TgpuAccessorImpl<T extends BaseData>
  extends AccessorBase<T, TgpuAccessor.In<T>>
  implements TgpuAccessor<T>
{
  readonly resourceType = 'accessor';

  declare readonly $: InferGPU<T>;

  static {
    makeDereferenceable(TgpuAccessorImpl.prototype, {
      getBaseSnippet(_trackingProxy) {
        return createAccessorSnippet(this);
      },
      normalGet() {
        throw new Error(
          '`tgpu.accessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call. Use `tgpu.slot` for non-WGSL values instead.',
        );
      },
    });
  }

  constructor(
    schemaOrConstructor: T | ((count: number) => T),
    defaultValue: TgpuAccessor.In<T> | undefined = undefined,
  ) {
    super(schemaOrConstructor, defaultValue);
  }
}

export class TgpuMutableAccessorImpl<T extends BaseData>
  extends AccessorBase<T, TgpuMutableAccessor.In<T>>
  implements TgpuMutableAccessor<T>
{
  readonly resourceType = 'mutable-accessor';

  declare $: InferGPU<T>;

  static {
    makeDereferenceable(TgpuMutableAccessorImpl.prototype, {
      getBaseSnippet(_trackingProxy) {
        return createAccessorSnippet(this);
      },
      normalGet() {
        throw new Error(
          '`tgpu.mutableAccessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call. Use `tgpu.slot` for non-WGSL values instead.',
        );
      },
    });
  }

  constructor(
    schemaOrConstructor: T | ((count: number) => T),
    defaultValue: TgpuMutableAccessor.In<T> | undefined = undefined,
  ) {
    super(schemaOrConstructor, defaultValue);
  }
}

import { type AnyData, isData, undecorate } from '../../data/dataTypes.ts';
import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { isSnippet, snip, type Snippet } from '../../data/snippet.ts';
import { deepEqual } from '../../data/deepEqual.ts';
import { arrayOf } from '../../data/array.ts';
import { UnknownData } from '../../data/dataTypes.ts';
import { type AnyWgslData, type BaseData, isAbstract, isWgslArray } from '../../data/wgslTypes.ts';
import { getResolutionCtx } from '../../execMode.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';
import { getName, hasTinyestMetadata, setName } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuCallable,
  $gpuValueOf,
  $internal,
  $resolve,
  $soul,
} from '../../shared/symbols.ts';
import type { UnwrapRuntimeConstructor } from '../../tgpuBindGroupLayout.ts';
import { getOwnSnippet, isGPUCallable, NormalState, type SelfResolvable } from '../../types.ts';
import { isTgpuFn } from '../function/tgpuFn.ts';
import { getGpuValueRecursively } from '../valueProxyUtils.ts';
import { slot } from './slot.ts';
import type { TgpuAccessor, TgpuAccessorSoul, TgpuMutableAccessor, TgpuSlot } from './slotTypes.ts';

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
 * Accessors typed with a runtime-sized array schema (e.g. `d.arrayOf(d.f32)`) accept
 * any array of that element type. If the provided JS value has a concrete length, we
 * use a statically-sized schema so that the generated code can take advantage of it.
 */
function concretizeSchema(accessorSchema: BaseData, value: unknown): BaseData {
  if (isWgslArray(accessorSchema) && accessorSchema.elementCount === 0 && Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error(
        `Cannot use empty array as an accessor value. Empty arrays aren't representable in shader code.`,
      );
    }
    return arrayOf(accessorSchema.elementType as AnyWgslData, value.length);
  }
  return accessorSchema;
}

/**
 * Whether a value of type `providedType` can be used in place of `accessorSchema` without
 * any conversion. Runtime-sized array schemas accept arrays of any length with a matching element type.
 */
function matchesSchema(accessorSchema: BaseData, providedType: BaseData | UnknownData): boolean {
  if (providedType === UnknownData) {
    return false;
  }
  const expected = undecorate(accessorSchema);
  const provided = undecorate(providedType);
  if (isWgslArray(expected) && expected.elementCount === 0 && isWgslArray(provided)) {
    return deepEqual(expected.elementType as AnyData, provided.elementType as AnyData);
  }
  return deepEqual(expected as AnyData, provided as AnyData);
}

/**
 * Values with a concrete WGSL type (buffers, variables, GPU functions, ...) are used as-is,
 * so they have to match the accessor's schema exactly.
 */
function validateAccessorSnippet(accessor: AccessorBase<BaseData, unknown>, snippet: Snippet) {
  const isMutable = accessor.resourceType === 'mutable-accessor';
  const description = `${isMutable ? 'mutable accessor' : 'accessor'} '${getName(accessor) ?? '<unnamed>'}'`;

  if (!matchesSchema(accessor.schema, snippet.dataType)) {
    throw new Error(
      `Value of type '${String(snippet.dataType)}' does not match the schema of ${description}: '${String(accessor.schema)}'.`,
    );
  }
}

/**
 * @returns A snippet representing the accessor.
 */
function createAccessorSnippet(accessor: AccessorBase<BaseData, unknown>): Snippet {
  const snippet = createUnvalidatedAccessorSnippet(accessor);
  validateAccessorSnippet(accessor, snippet);
  return snippet;
}

function createUnvalidatedAccessorSnippet(accessor: AccessorBase<BaseData, unknown>): Snippet {
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
    const result = value[$gpuCallable].call(ctx, []);
    if (result.dataType !== UnknownData && !isAbstract(result.dataType)) {
      return result;
    }
    // The result is a plain JS value (e.g. an array literal or a number returned from
    // `tgpu.comptime`), so we treat it the same way as a directly provided JS value.
    value = result.value;
  }

  if (isTgpuFn(value) || hasTinyestMetadata(value)) {
    const fn = ctx.resolve(value);
    return ctx.withResetIndentLevel(() =>
      snip(`${fn.value}()`, fn.dataType, /* origin */ 'runtime', fn.possibleSideEffects),
    );
  }

  ctx.pushMode(new NormalState());
  try {
    const schema = concretizeSchema(accessor.schema, value);
    // Doing a deep copy each time so that we don't have to deal with refs
    const cloned = schemaCallWrapper(schema, value);
    return snip(cloned, schema, 'constant', /* possibleSideEffects */ false);
  } finally {
    ctx.popMode('normal');
  }
}

abstract class AccessorBase<
  T extends BaseData,
  TValue extends TgpuAccessor.In<T> | TgpuMutableAccessor.In<T>,
> {
  readonly [$getNameForward]: unknown;
  readonly [$soul]: TgpuAccessorSoul<T, TValue>;
  readonly slot: TgpuSlot<TValue>;

  abstract readonly resourceType: string;

  // prototype properties
  declare [$internal]: true;
  declare [$resolve]: SelfResolvable[typeof $resolve];
  declare readonly [$gpuValueOf]: InferGPU<T>;
  abstract readonly $: InferGPU<T>;

  static {
    AccessorBase.prototype[$internal] = true;

    makeResolvable(AccessorBase.prototype, {
      asString() {
        return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
      },
      resolve(ctx) {
        return ctx.resolveSnippet(createAccessorSnippet(this));
      },
    });
  }

  constructor(
    type: 'accessor' | 'mutable-accessor',
    schemaOrConstructor: T | ((count: number) => T),
    defaultValue: TValue | undefined = undefined,
  ) {
    this[$soul] = {
      type,
      schema: isData(schemaOrConstructor)
        ? schemaOrConstructor
        : (schemaOrConstructor as (count: number) => T)(0),
      defaultValue,
      label: undefined,
    };

    // NOTE: in certain setups, unplugin can run on package typegpu, so we have to avoid auto-naming triggering here
    this.slot = (() => slot(defaultValue))();
    this[$getNameForward] = this.slot;
  }

  get schema(): T {
    return this[$soul].schema;
  }

  get defaultValue(): TValue | undefined {
    return this[$soul].defaultValue;
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
}

export class TgpuAccessorImpl<T extends BaseData>
  extends AccessorBase<T, TgpuAccessor.In<T>>
  implements TgpuAccessor<T>
{
  // prototype properties
  declare resourceType: 'accessor';
  declare readonly $: InferGPU<T>;

  static {
    TgpuAccessorImpl.prototype.resourceType = 'accessor';

    makeDereferenceable(TgpuAccessorImpl.prototype, {
      codegenMode: {
        get() {
          return createAccessorSnippet(this);
        },
      },
      normalMode: {
        get() {
          throw new Error(
            '`tgpu.accessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call. Use `tgpu.slot` for non-WGSL values instead.',
          );
        },
      },
    });
  }

  constructor(
    schemaOrConstructor: T | ((count: number) => T),
    defaultValue: TgpuAccessor.In<T> | undefined = undefined,
  ) {
    super('accessor', schemaOrConstructor, defaultValue);
  }
}

export class TgpuMutableAccessorImpl<T extends BaseData>
  extends AccessorBase<T, TgpuMutableAccessor.In<T>>
  implements TgpuMutableAccessor<T>
{
  // prototype properties
  declare resourceType: 'mutable-accessor';
  declare $: InferGPU<T>;

  static {
    TgpuMutableAccessorImpl.prototype.resourceType = 'mutable-accessor';

    makeDereferenceable(TgpuMutableAccessorImpl.prototype, {
      codegenMode: {
        get() {
          return createAccessorSnippet(this);
        },
      },
      normalMode: {
        get() {
          throw new Error(
            '`tgpu.mutableAccessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call. Use `tgpu.slot` for non-WGSL values instead.',
          );
        },
      },
    });
  }

  constructor(
    schemaOrConstructor: T | ((count: number) => T),
    defaultValue: TgpuMutableAccessor.In<T> | undefined = undefined,
  ) {
    super('mutable-accessor', schemaOrConstructor, defaultValue);
  }
}

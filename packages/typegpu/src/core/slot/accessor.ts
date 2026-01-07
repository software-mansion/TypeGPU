import { type AnyData, isData } from '../../data/dataTypes.ts';
import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { getResolutionCtx, inCodegenMode } from '../../execMode.ts';
import { getName, hasTinyestMetadata } from '../../shared/meta.ts';
import type { InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $resolve,
} from '../../shared/symbols.ts';
import type { UnwrapRuntimeConstructor } from '../../tgpuBindGroupLayout.ts';
import { coerceToSnippet } from '../../tgsl/generationHelpers.ts';
import {
  getOwnSnippet,
  NormalState,
  type ResolutionCtx,
  type SelfResolvable,
} from '../../types.ts';
import { isComptimeFn } from '../function/comptime.ts';
import { isTgpuFn } from '../function/tgpuFn.ts';
import {
  getGpuValueRecursively,
  valueProxyHandler,
} from '../valueProxyUtils.ts';
import { slot as slotConstructor } from './slot.ts';
import type {
  AccessorIn,
  MutableAccessorIn,
  TgpuAccessor,
  TgpuSlot,
} from './slotTypes.ts';

// ----------
// Public API
// ----------

export function accessor<T extends AnyData | ((count: number) => AnyData)>(
  schemaOrConstructor: T,
  defaultValue?: AccessorIn<UnwrapRuntimeConstructor<NoInfer<T>>>,
): TgpuAccessor<UnwrapRuntimeConstructor<T>> {
  return new TgpuAccessorImpl(
    schemaOrConstructor,
    defaultValue,
  ) as unknown as TgpuAccessor<UnwrapRuntimeConstructor<T>>;
}

export function mutableAccessor<
  T extends AnyData | ((count: number) => AnyData),
>(
  schemaOrConstructor: T,
  defaultValue?: MutableAccessorIn<UnwrapRuntimeConstructor<NoInfer<T>>>,
): TgpuAccessor<UnwrapRuntimeConstructor<T>> {
  return new TgpuAccessorImpl(
    schemaOrConstructor,
    defaultValue,
  ) as unknown as TgpuAccessor<UnwrapRuntimeConstructor<T>>;
}

// --------------
// Implementation
// --------------

export class TgpuAccessorImpl<T extends AnyData>
  implements TgpuAccessor<T>, SelfResolvable {
  readonly [$internal] = true;
  readonly [$getNameForward]: unknown;
  readonly resourceType = 'accessor';
  readonly slot: TgpuSlot<AccessorIn<T>>;

  readonly schema: T;
  readonly defaultValue: AccessorIn<T> | undefined;

  constructor(
    schemaOrConstructor: T | ((count: number) => T),
    defaultValue: AccessorIn<T> | undefined = undefined,
  ) {
    this.schema = isData(schemaOrConstructor)
      ? schemaOrConstructor
      : schemaOrConstructor(0);
    this.defaultValue = defaultValue;

    // NOTE: in certain setups, unplugin can run on package typegpu, so we have to avoid auto-naming triggering here
    this.slot = slotConstructor(defaultValue);
    this[$getNameForward] = this.slot;
  }

  get [$gpuValueOf](): InferGPU<T> {
    return new Proxy({
      [$internal]: true,
      [$ownSnippet]: this.#createSnippet(),
      [$resolve]: (ctx) => ctx.resolve(this),
      toString: () => `accessor:${getName(this) ?? '<unnamed>'}.$`,
    }, valueProxyHandler) as InferGPU<T>;
  }

  /**
   * @returns A snippet representing the accessor.
   */
  #createSnippet() {
    // biome-ignore lint/style/noNonNullAssertion: it's there
    const ctx = getResolutionCtx()!;
    let value = getGpuValueRecursively(ctx.unwrap(this.slot));

    if (isTgpuFn(value) || hasTinyestMetadata(value)) {
      return ctx.withResetIndentLevel(() =>
        snip(
          `${ctx.resolve(value).value}()`,
          this.schema,
          /* origin */ 'runtime',
        )
      );
    }

    const ownSnippet = getOwnSnippet(value);
    if (ownSnippet) {
      return ownSnippet;
    }

    if (typeof value === 'function' && !isComptimeFn(value)) {
      // Not a comptime or GPU function, so has to be a resource accessor
      // Running the function in codegen mode
      return coerceToSnippet(value());
    }

    ctx.pushMode(new NormalState());
    try {
      if (typeof value === 'function') {
        // Has to be comptime
        value = value();
      }

      // Doing a deep copy each time so that we don't have to deal with refs
      const cloned = schemaCallWrapper(
        this.schema,
        value,
      );
      return snip(cloned, this.schema, 'constant');
    } finally {
      ctx.popMode('normal');
    }
  }

  $name(label: string) {
    this.slot.$name(label);
    return this;
  }

  toString(): string {
    return `accessor:${getName(this) ?? '<unnamed>'}`;
  }

  get value(): InferGPU<T> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      '`tgpu.accessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call',
    );
  }

  get $(): InferGPU<T> {
    return this.value;
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

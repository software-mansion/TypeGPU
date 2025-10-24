import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { getResolutionCtx, inCodegenMode } from '../../execMode.ts';
import { getName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $resolve,
} from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import { isTgpuFn, type TgpuFn } from '../function/tgpuFn.ts';
import {
  getGpuValueRecursively,
  valueProxyHandler,
} from '../valueProxyUtils.ts';
import { slot } from './slot.ts';
import type { TgpuAccessor, TgpuSlot } from './slotTypes.ts';

// ----------
// Public API
// ----------

export function accessor<T extends AnyWgslData>(
  schema: T,
  defaultValue?: TgpuFn<() => T> | TgpuBufferUsage<T> | Infer<T>,
): TgpuAccessor<T> {
  return new TgpuAccessorImpl(schema, defaultValue);
}

// --------------
// Implementation
// --------------

export class TgpuAccessorImpl<T extends AnyWgslData>
  implements TgpuAccessor<T>, SelfResolvable {
  readonly [$internal] = true;
  readonly [$getNameForward]: unknown;
  readonly resourceType = 'accessor';
  readonly slot: TgpuSlot<TgpuFn<() => T> | TgpuBufferUsage<T> | Infer<T>>;

  constructor(
    public readonly schema: T,
    public readonly defaultValue:
      | TgpuFn<() => T>
      | TgpuBufferUsage<T>
      | Infer<T>
      | undefined = undefined,
  ) {
    this.slot = slot(defaultValue);
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
    const value = getGpuValueRecursively(ctx.unwrap(this.slot));

    if (isTgpuFn(value)) {
      return value[$internal].gpuImpl();
    }

    return snip(value, this.schema);
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
    );
  }
}

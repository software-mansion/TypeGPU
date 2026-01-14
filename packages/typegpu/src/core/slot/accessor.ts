import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { getResolutionCtx, inCodegenMode } from '../../execMode.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $resolve,
} from '../../shared/symbols.ts';
import {
  getOwnSnippet,
  NormalState,
  type ResolutionCtx,
  type SelfResolvable,
} from '../../types.ts';
import type { TgpuBufferShorthand } from '../buffer/bufferShorthand.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import { isTgpuFn, type TgpuFn } from '../function/tgpuFn.ts';
import {
  getGpuValueRecursively,
  valueProxyHandler,
} from '../valueProxyUtils.ts';
import { slot as slotConstructor } from './slot.ts';
import type { TgpuAccessor, TgpuSlot } from './slotTypes.ts';

// ----------
// Public API
// ----------

export function accessor<T extends AnyWgslData>(
  schema: T,
  defaultValue?:
    | TgpuFn<() => T>
    | TgpuBufferUsage<T>
    | TgpuBufferShorthand<T>
    | Infer<T>,
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
  readonly slot: TgpuSlot<
    TgpuFn<() => T> | TgpuBufferUsage<T> | TgpuBufferShorthand<T> | Infer<T>
  >;

  constructor(
    public readonly schema: T,
    public readonly defaultValue:
      | TgpuFn<() => T>
      | TgpuBufferUsage<T>
      | TgpuBufferShorthand<T>
      | Infer<T>
      | undefined = undefined,
  ) {
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
    const value = getGpuValueRecursively(ctx.unwrap(this.slot));

    if (isTgpuFn(value)) {
      return value[$internal].gpuImpl();
    }

    const ownSnippet = getOwnSnippet(value);
    if (ownSnippet) {
      return ownSnippet;
    }

    ctx.pushMode(new NormalState());
    try {
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
    setName(this, label);
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

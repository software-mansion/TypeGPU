import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { type AnyWgslData, type BaseData } from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import { isUsableAsStorage, type StorageFlag } from '../../extension.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $ownSnippet, $repr, $resolve } from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { BindableBufferUsage, ResolutionCtx, SelfResolvable } from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
import type { TgpuBuffer, UniformFlag } from './buffer.ts';
import {
  TgpuBufferShorthandImpl,
  type TgpuMutable,
  type TgpuReadonly,
  type TgpuUniform,
} from './bufferShorthand.ts';

// ----------
// Public API
// ----------

interface TgpuBufferUsage<
  TData extends BaseData = BaseData,
  TUsage extends BindableBufferUsage = BindableBufferUsage,
> {
  readonly resourceType: 'buffer-usage';
  readonly usage: TUsage;
  readonly [$repr]: Infer<TData>;

  readonly [$gpuValueOf]: InferGPU<TData>;
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  value: InferGPU<TData>;
  $: InferGPU<TData>;

  readonly [$internal]: {
    readonly dataType: TData;
  };
}

/**
 * @deprecated use TgpuUniform instead.
 */
export interface TgpuBufferUniform<TData extends BaseData> extends TgpuBufferUsage<
  TData,
  'uniform'
> {
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
}

/**
 * @deprecated use TgpuReadonly instead.
 */
export interface TgpuBufferReadonly<TData extends BaseData> extends TgpuBufferUsage<
  TData,
  'readonly'
> {
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
}

/**
 * @deprecated use TgpuMutable instead.
 */
export interface TgpuBufferMutable<TData extends BaseData> extends TgpuBufferUsage<
  TData,
  'mutable'
> {}

export function isUsableAsUniform<T extends TgpuBuffer<BaseData>>(
  buffer: T,
): buffer is T & UniformFlag {
  return !!buffer.usableAsUniform;
}

// --------------
// Implementation
// --------------

/**
 * A class representing a buffer accessed via a BindGroupLayout.
 * Compared to a regular buffer, it's missing read/write methods,
 * but it holds a membership.
 */
export class TgpuLaidOutBufferImpl<
  TData extends BaseData,
  TUsage extends BindableBufferUsage,
> implements SelfResolvable {
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<TData>;

  readonly [$internal]: { readonly dataType: TData };
  readonly resourceType = 'laid-out-buffer' as const;
  readonly usage: TUsage;
  readonly dataType: TData;

  readonly #membership: LayoutMembership;

  constructor(usage: TUsage, dataType: TData, membership: LayoutMembership) {
    this[$internal] = { dataType };
    this.usage = usage;
    this.dataType = dataType;
    this.#membership = membership;
    setName(this, membership.key);
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.makeUniqueIdentifier(getName(this), 'global');
    const group = ctx.allocateLayoutEntry(this.#membership.layout);

    return ctx.gen.declareGlobalVar({
      group,
      binding: this.#membership.idx,
      scope: this.usage,
      id,
      dataType: this.dataType,
      init: undefined,
    });
  }

  toString(): string {
    return `${this.usage}:${getName(this) ?? '<unnamed>'}`;
  }

  get [$gpuValueOf](): InferGPU<TData> {
    const schema = this.dataType;
    const usage = this.usage;

    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, schema, usage);
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `${this.usage}:${getName(this) ?? '<unnamed>'}.$`,
      },
      valueProxyHandler,
    ) as InferGPU<TData>;
  }

  get $(): InferGPU<TData> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      'Direct access to buffer values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
    );
  }

  get value(): InferGPU<TData> {
    return this.$;
  }
}

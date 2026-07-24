import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { type BaseData } from '../../data/wgslTypes.ts';
import { makeDereferenceable } from '../../internal.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $repr, $resolve } from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { BindableBufferUsage, ResolutionCtx, SelfResolvable } from '../../types.ts';

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

  declare $: InferGPU<TData>;
  declare readonly [$gpuValueOf]: InferGPU<TData>;

  static {
    makeDereferenceable(TgpuLaidOutBufferImpl.prototype, {
      //
      // CODEGEN
      //
      getBaseSnippet(trackingProxy) {
        return snip(trackingProxy, this.dataType, this.usage, /* possible side effects */ false);
      },
      //
      // NORMAL
      //
      normalGet() {
        throw new Error(
          'Direct access to buffer values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
        );
      },
    });
  }

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
}

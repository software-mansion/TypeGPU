import type { WgslComparisonSamplerProps, WgslSamplerProps } from '../../data/sampler.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $ownSnippet, $repr, $resolve } from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { Unwrapper } from '../../unwrapper.ts';
import {
  comparisonSampler as wgslComparisonSampler,
  sampler as wgslSampler,
  type WgslComparisonSampler,
  type WgslSampler,
} from '../../data/sampler.ts';
import { inCodegenMode } from '../../execMode.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

interface SamplerInternals {
  readonly unwrap?: (() => GPUSampler) | undefined;
}

// ----------
// Public API
// ----------

export interface TgpuSampler {
  readonly [$internal]: SamplerInternals;
  readonly resourceType: 'sampler';
  readonly schema: WgslSampler;

  readonly [$gpuValueOf]: Infer<WgslSampler>;
  value: Infer<WgslSampler>;
  $: Infer<WgslSampler>;
}

export interface TgpuComparisonSampler {
  readonly [$internal]: SamplerInternals;
  readonly resourceType: 'sampler-comparison';
  readonly schema: WgslComparisonSampler;

  readonly [$gpuValueOf]: Infer<WgslComparisonSampler>;
  value: Infer<WgslComparisonSampler>;
  $: Infer<WgslComparisonSampler>;
}

export interface TgpuFixedSampler extends TgpuSampler, TgpuNamable {}

export interface TgpuFixedComparisonSampler extends TgpuComparisonSampler, TgpuNamable {}

export function INTERNAL_createSampler(
  props: WgslSamplerProps,
  branch: Unwrapper,
): TgpuFixedSampler {
  return new TgpuFixedSamplerImpl(wgslSampler(), props, branch) as TgpuFixedSampler;
}

export function INTERNAL_createComparisonSampler(
  props: WgslComparisonSamplerProps,
  branch: Unwrapper,
): TgpuFixedComparisonSampler {
  return new TgpuFixedSamplerImpl(
    wgslComparisonSampler(),
    props,
    branch,
  ) as TgpuFixedComparisonSampler;
}

export function isSampler(resource: unknown): resource is TgpuSampler {
  const maybe = resource as TgpuSampler | undefined;
  return maybe?.resourceType === 'sampler' && !!maybe[$internal];
}

export function isComparisonSampler(resource: unknown): resource is TgpuComparisonSampler {
  const maybe = resource as TgpuComparisonSampler | undefined;
  return maybe?.resourceType === 'sampler-comparison' && !!maybe[$internal];
}

// --------------
// Implementation
// --------------

export class TgpuLaidOutSamplerImpl<
  T extends WgslSampler | WgslComparisonSampler,
> implements SelfResolvable {
  declare readonly [$repr]: Infer<T>;
  public readonly [$internal]: SamplerInternals = { unwrap: undefined };
  public readonly resourceType: T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
  readonly #membership: LayoutMembership;

  constructor(
    readonly schema: T,
    membership: LayoutMembership,
  ) {
    this.#membership = membership;
    this.resourceType = (
      schema.type === 'sampler_comparison' ? 'sampler-comparison' : 'sampler'
    ) as T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
    setName(this, membership.key);
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.getUniqueName(this);
    const group = ctx.allocateLayoutEntry(this.#membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this.#membership.idx}) var ${id}: ${
        ctx.resolve(this.schema).value
      };`,
    );

    return snip(id, this.schema, /* origin */ 'handle');
  }

  get [$gpuValueOf](): Infer<T> {
    const schema = this.schema;
    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, schema, /* origin */ 'handle');
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `${this.toString()}.$`,
      },
      valueProxyHandler,
    ) as unknown as Infer<T>;
  }

  get $(): Infer<T> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      'Direct access to sampler values is possible only as part of a compute dispatch or draw call.',
    );
  }

  get value(): Infer<T> {
    return this.$;
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}

class TgpuFixedSamplerImpl<T extends WgslSampler | WgslComparisonSampler>
  implements SelfResolvable, TgpuNamable
{
  declare readonly [$repr]: Infer<T>;
  public readonly [$internal]: SamplerInternals;
  public readonly resourceType: T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';

  #filtering: boolean;
  #sampler: GPUSampler | null = null;
  #props: WgslSamplerProps | WgslComparisonSamplerProps;
  #branch: Unwrapper;

  constructor(
    readonly schema: T,
    props: WgslSamplerProps | WgslComparisonSamplerProps,
    branch: Unwrapper,
  ) {
    this.#props = props;
    this.#branch = branch;
    this.resourceType = (
      schema.type === 'sampler_comparison' ? 'sampler-comparison' : 'sampler'
    ) as T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
    this[$internal] = {
      unwrap: () => {
        if (!this.#sampler) {
          this.#sampler = this.#branch.device.createSampler({
            ...this.#props,
            label: getName(this) ?? '<unnamed>',
          });
        }

        return this.#sampler;
      },
    };

    // Based on https://www.w3.org/TR/webgpu/#sampler-creation
    this.#filtering =
      props.minFilter === 'linear' ||
      props.magFilter === 'linear' ||
      props.mipmapFilter === 'linear';
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.getUniqueName(this);

    const { group, binding } = ctx.allocateFixedEntry(
      this.schema.type === 'sampler_comparison'
        ? { sampler: 'comparison' }
        : { sampler: this.#filtering ? 'filtering' : 'non-filtering' },
      this,
    );

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var ${id}: ${ctx.resolve(this.schema).value};`,
    );

    return snip(id, this.schema, /* origin */ 'handle');
  }

  get [$gpuValueOf](): Infer<T> {
    const schema = this.schema;
    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, schema, /* origin */ 'handle');
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `${this.toString()}.$`,
      },
      valueProxyHandler,
    ) as unknown as Infer<T>;
  }

  get $(): Infer<T> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      'Direct access to sampler values is possible only as part of a compute dispatch or draw call.',
    );
  }

  get value(): Infer<T> {
    return this.$;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}

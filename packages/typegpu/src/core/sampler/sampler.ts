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
import { invariant } from '../../errors.ts';
import type { RestoreContext } from '../../serial/types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';

interface SamplerInternals {
  readonly unwrap?: (() => GPUSampler) | undefined;
  // Only present on fixed samplers
  readonly props?: WgslSamplerProps | WgslComparisonSamplerProps | undefined;
  readonly device?: GPUDevice | undefined;
}

// ----------
// Public API
// ----------

export interface TgpuSampler {
  readonly [$internal]: SamplerInternals;
  readonly resourceType: 'sampler';
  readonly schema: WgslSampler;

  readonly [$gpuValueOf]: Infer<WgslSampler>;
  $: Infer<WgslSampler>;

  toString(): string;
}

export interface TgpuComparisonSampler {
  readonly [$internal]: SamplerInternals;
  readonly resourceType: 'sampler-comparison';
  readonly schema: WgslComparisonSampler;

  readonly [$gpuValueOf]: Infer<WgslComparisonSampler>;
  $: Infer<WgslComparisonSampler>;

  toString(): string;
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

export interface TgpuSamplerSnapshot {
  readonly type: 'sampler' | 'sampler-comparison';
  readonly device: GPUDevice;
  readonly props: WgslSamplerProps | WgslComparisonSamplerProps;
}

export function INTERNAL_isSnapshotableSampler(
  value: unknown,
): value is TgpuSampler | TgpuComparisonSampler {
  return (isSampler(value) || isComparisonSampler(value)) && value[$internal].props !== undefined;
}

export function INTERNAL_snapshotSampler(
  sampler: TgpuSampler | TgpuComparisonSampler,
): TgpuSamplerSnapshot {
  const { props, device } = sampler[$internal];
  invariant(props && device, 'Only samplers created from props can be snapshotted.');
  return { type: sampler.resourceType, device, props };
}

export function INTERNAL_restoreSampler(
  snapshot: TgpuSamplerSnapshot,
  ctx: RestoreContext,
): TgpuSampler | TgpuComparisonSampler {
  const root = ctx.getRoot(snapshot.device);
  return snapshot.type === 'sampler'
    ? root.createSampler(snapshot.props as WgslSamplerProps)
    : root.createComparisonSampler(snapshot.props as WgslComparisonSamplerProps);
}

// --------------
// Implementation
// --------------

export class TgpuLaidOutSamplerImpl<
  T extends WgslSampler | WgslComparisonSampler,
> implements SelfResolvable {
  declare readonly [$repr]: Infer<T>;
  readonly [$internal]: SamplerInternals = { unwrap: undefined };
  readonly resourceType: T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
  readonly schema: T;
  readonly #membership: LayoutMembership;

  constructor(schema: T, membership: LayoutMembership) {
    this.schema = schema;
    this.#membership = membership;
    this.resourceType = (
      schema.type === 'sampler_comparison' ? 'sampler-comparison' : 'sampler'
    ) as T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
    setName(this, membership.key);
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.makeUniqueIdentifier(getName(this), 'global');
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
          return snip(this, schema, /* origin */ 'handle', false);
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

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}

class TgpuFixedSamplerImpl<T extends WgslSampler | WgslComparisonSampler>
  implements SelfResolvable, TgpuNamable
{
  declare readonly [$repr]: Infer<T>;
  readonly [$internal]: SamplerInternals;
  readonly resourceType: T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
  readonly schema: T;

  #filtering: boolean;
  #sampler: GPUSampler | null = null;
  #props: WgslSamplerProps | WgslComparisonSamplerProps;
  #branch: Unwrapper;

  constructor(schema: T, props: WgslSamplerProps | WgslComparisonSamplerProps, branch: Unwrapper) {
    this.schema = schema;
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
      props,
      device: branch.device,
    };

    // Based on https://www.w3.org/TR/webgpu/#sampler-creation
    this.#filtering =
      props.minFilter === 'linear' ||
      props.magFilter === 'linear' ||
      props.mipmapFilter === 'linear';
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.makeUniqueIdentifier(getName(this), 'global');

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
          return snip(this, schema, /* origin */ 'handle', false);
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

  $name(label: string) {
    setName(this, label);
    return this;
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}

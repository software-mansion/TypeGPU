import type { WgslComparisonSamplerProps, WgslSamplerProps } from '../../data/sampler.ts';
import { snip } from '../../data/snippet.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import type { TgpuDeviceOwningSoul } from '../../shared/soul.ts';
import { $gpuValueOf, $internal, $repr, $resolve, $soul } from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import {
  comparisonSampler as wgslComparisonSampler,
  sampler as wgslSampler,
  type WgslComparisonSampler,
  type WgslSampler,
} from '../../data/sampler.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import { makeResolvable } from '../../tgsl/makeResolvable.ts';
import type { SelfResolvable } from '../../types.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';

interface SamplerInternals {
  readonly root?: ExperimentalTgpuRoot;
  readonly materialize?: (() => GPUSampler) | undefined;
}

export interface TgpuSamplerSoul extends TgpuDeviceOwningSoul<
  'sampler' | 'sampler-comparison',
  GPUSampler
> {
  readonly props: WgslSamplerProps | WgslComparisonSamplerProps;
}

// ----------
// Public API
// ----------

export interface TgpuSampler {
  readonly [$internal]: SamplerInternals;
  readonly resourceType: 'sampler';
  readonly schema: WgslSampler;

  readonly [$gpuValueOf]: InferGPU<WgslSampler>;
  $: InferGPU<WgslSampler>;

  toString(): string;
}

export interface TgpuComparisonSampler {
  readonly [$internal]: SamplerInternals;
  readonly resourceType: 'sampler-comparison';
  readonly schema: WgslComparisonSampler;

  readonly [$gpuValueOf]: InferGPU<WgslComparisonSampler>;
  $: InferGPU<WgslComparisonSampler>;

  toString(): string;
}

export interface TgpuFixedSampler extends TgpuSampler, TgpuNamable {
  readonly [$soul]: TgpuSamplerSoul;
}

export interface TgpuFixedComparisonSampler extends TgpuComparisonSampler, TgpuNamable {
  readonly [$soul]: TgpuSamplerSoul;
}

export function INTERNAL_createSampler(
  props: WgslSamplerProps,
  root: ExperimentalTgpuRoot,
): TgpuFixedSampler {
  return new TgpuFixedSamplerImpl(wgslSampler(), props, root) as TgpuFixedSampler;
}

export function INTERNAL_createComparisonSampler(
  props: WgslComparisonSamplerProps,
  root: ExperimentalTgpuRoot,
): TgpuFixedComparisonSampler {
  return new TgpuFixedSamplerImpl(
    wgslComparisonSampler(),
    props,
    root,
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
  readonly [$internal]: SamplerInternals = { materialize: undefined };
  readonly resourceType: T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
  readonly schema: T;
  readonly #membership: LayoutMembership;

  // prototype properties
  declare [$resolve]: SelfResolvable[typeof $resolve];
  declare $: InferGPU<WgslSampler>;
  declare readonly [$gpuValueOf]: InferGPU<WgslSampler>;

  static {
    makeDereferenceable(
      makeResolvable(TgpuLaidOutSamplerImpl.prototype, {
        asString() {
          return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
        },
        resolve(ctx) {
          const id = ctx.makeUniqueIdentifier(getName(this), 'global');
          const group = ctx.allocateLayoutEntry(this.#membership.layout);

          ctx.addDeclaration(
            `@group(${group}) @binding(${this.#membership.idx}) var ${id}: ${
              ctx.resolve(this.schema).value
            };`,
            id,
          );

          return snip(id, this.schema, /* origin */ 'handle');
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(trackingProxy, this.schema, /* origin */ 'handle', false);
          },
        },
        normalMode: {
          get() {
            throw new Error(
              'Direct access to sampler values is possible only as part of a compute dispatch or draw call.',
            );
          },
        },
      },
    );
  }

  constructor(schema: T, membership: LayoutMembership) {
    this.schema = schema;
    this.#membership = membership;
    this.resourceType = (
      schema.type === 'sampler_comparison' ? 'sampler-comparison' : 'sampler'
    ) as T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
    setName(this, membership.key);
  }
}

class TgpuFixedSamplerImpl<T extends WgslSampler | WgslComparisonSampler> implements TgpuNamable {
  declare readonly [$repr]: Infer<T>;
  readonly [$internal]: SamplerInternals;
  readonly [$soul]: TgpuSamplerSoul;
  readonly resourceType: T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
  readonly schema: T;

  #filtering: boolean;

  // prototype props
  declare readonly [$gpuValueOf]: InferGPU<T>;
  declare readonly $: InferGPU<T>;

  static {
    makeDereferenceable(
      makeResolvable(TgpuFixedSamplerImpl.prototype, {
        asString() {
          return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
        },
        resolve(ctx) {
          const id = ctx.makeUniqueIdentifier(getName(this), 'global');

          const { group, binding } = ctx.allocateFixedEntry(
            this.schema.type === 'sampler_comparison'
              ? { sampler: 'comparison' }
              : { sampler: this.#filtering ? 'filtering' : 'non-filtering' },
            this,
          );

          ctx.addDeclaration(
            `@group(${group}) @binding(${binding}) var ${id}: ${ctx.resolve(this.schema).value};`,
            id,
          );

          return snip(id, this.schema, /* origin */ 'handle');
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(trackingProxy, this.schema, /* origin */ 'handle', false);
          },
        },
        normalMode: {
          get() {
            throw new Error(
              'Direct access to sampler values is possible only as part of a compute dispatch or draw call.',
            );
          },
        },
      },
    );
  }

  constructor(
    schema: T,
    props: WgslSamplerProps | WgslComparisonSamplerProps,
    root: ExperimentalTgpuRoot,
  ) {
    this.schema = schema;
    this.resourceType = (
      schema.type === 'sampler_comparison' ? 'sampler-comparison' : 'sampler'
    ) as T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
    this[$soul] = {
      type: this.resourceType,
      device: root.device,
      props,
      raw: undefined,
      label: undefined,
    };
    this[$internal] = {
      root,
      materialize: () => {
        const soul = this[$soul];
        if (!soul.raw) {
          soul.raw = soul.device.createSampler({
            ...soul.props,
            label: getName(this) ?? '<unnamed>',
          });
        }

        return soul.raw;
      },
    };

    // Based on https://www.w3.org/TR/webgpu/#sampler-creation
    this.#filtering =
      props.minFilter === 'linear' ||
      props.magFilter === 'linear' ||
      props.mipmapFilter === 'linear';
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }
}

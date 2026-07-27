import type { WgslComparisonSamplerProps, WgslSamplerProps } from '../../data/sampler.ts';
import { snip } from '../../data/snippet.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import { $gpuValueOf, $internal, $repr } from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { Unwrapper } from '../../unwrapper.ts';
import {
  comparisonSampler as wgslComparisonSampler,
  sampler as wgslSampler,
  type WgslComparisonSampler,
  type WgslSampler,
} from '../../data/sampler.ts';
import { makeDereferenceable, makeResolvable } from '../../internal.ts';

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

export class TgpuLaidOutSamplerImpl<T extends WgslSampler | WgslComparisonSampler> {
  declare readonly [$repr]: Infer<T>;
  readonly [$internal]: SamplerInternals = { unwrap: undefined };
  readonly resourceType: T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
  readonly schema: T;
  readonly #membership: LayoutMembership;

  // prototype properties
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
  readonly resourceType: T extends WgslComparisonSampler ? 'sampler-comparison' : 'sampler';
  readonly schema: T;

  #filtering: boolean;
  #sampler: GPUSampler | null = null;
  #props: WgslSamplerProps | WgslComparisonSamplerProps;
  #branch: Unwrapper;

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

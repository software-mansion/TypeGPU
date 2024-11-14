import type { TgpuNamable } from './namable';
import { code } from './tgpuCode';
import { identifier } from './tgpuIdentifier';
import type { ResolutionCtx } from './types';

export interface TgpuSampler extends TgpuNamable {
  readonly resourceType: 'sampler';
  readonly descriptor: GPUSamplerDescriptor;
}

export function sampler(descriptor: GPUSamplerDescriptor): TgpuSampler {
  return new TgpuSamplerImpl(descriptor);
}

class TgpuSamplerImpl implements TgpuSampler {
  public readonly resourceType = 'sampler';

  private _label: string | undefined;
  private readonly _type: string;

  constructor(public readonly descriptor: GPUSamplerDescriptor) {
    if (descriptor.compare === undefined) this._type = 'sampler';
    else this._type = 'sampler_comparison';
  }

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this._label);
    const { group, binding } = ctx.allocateFixedEntry(this);

    ctx.addDeclaration(
      code`@group(${group}) @binding(${binding}) var ${ident}: ${this._type};`,
    );

    return ctx.resolve(ident);
  }
}

export function isSampler(resource: unknown): resource is TgpuSampler {
  return (resource as TgpuSampler)?.resourceType === 'sampler';
}

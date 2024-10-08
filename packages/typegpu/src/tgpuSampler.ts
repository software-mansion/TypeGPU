import type { TgpuNamable } from './namable';
import { identifier } from './tgpuIdentifier';
import type {
  ResolutionCtx,
  TgpuRenderResource,
  TgpuSamplerType,
} from './types';

export interface TgpuSampler extends TgpuRenderResource, TgpuNamable {
  readonly descriptor: GPUSamplerDescriptor;
}

export function sampler(descriptor: GPUSamplerDescriptor): TgpuSampler {
  return new TgpuSamplerImpl(descriptor);
}

class TgpuSamplerImpl implements TgpuSampler {
  private _label: string | undefined;
  private _type: TgpuSamplerType;

  constructor(public readonly descriptor: GPUSamplerDescriptor) {
    if (descriptor.compare === undefined) this._type = 'sampler';
    else this._type = 'sampler_comparison';
  }

  get label() {
    return this._label;
  }

  get type() {
    return this._type;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this._label);
    ctx.addRenderResource(this, ident);
    return ctx.resolve(ident);
  }
}

export function isSampler(
  resource: TgpuRenderResource,
): resource is TgpuSampler {
  return resource.type === 'sampler' || resource.type === 'sampler_comparison';
}

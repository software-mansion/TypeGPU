import type {
  ResolutionCtx,
  WgslRenderResource,
  WgslRenderResourceType,
  WgslSamplerType,
} from './types';
import { WgslIdentifier } from './wgslIdentifier';

export interface WgslSampler extends WgslRenderResource<WgslSamplerType> {
  readonly descriptor: GPUSamplerDescriptor;
}

export function sampler(descriptor: GPUSamplerDescriptor): WgslSampler {
  return new WgslSamplerImpl(descriptor);
}

class WgslSamplerImpl implements WgslSampler {
  private _label: string | undefined;
  private _type: WgslSamplerType;

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
    const identifier = new WgslIdentifier();

    ctx.addRenderResource(this, identifier);

    return ctx.resolve(identifier);
  }
}

export function isSampler(
  resource: WgslRenderResource<WgslRenderResourceType>,
): resource is WgslSampler {
  return resource.type === 'sampler' || resource.type === 'sampler_comparison';
}

import type {
  ResolutionCtx,
  WgslNamable,
  WgslRenderResource,
  WgslSamplerType,
} from './types';
import { WgslIdentifier } from './wgslIdentifier';
import { WgslResolvableBase } from './wgslResolvableBase';

export interface WgslSampler extends WgslRenderResource, WgslNamable {
  readonly descriptor: GPUSamplerDescriptor;
}

export function sampler(descriptor: GPUSamplerDescriptor): WgslSampler {
  return new WgslSamplerImpl(descriptor);
}

class WgslSamplerImpl extends WgslResolvableBase implements WgslSampler {
  private _type: WgslSamplerType;
  readonly typeInfo = 'sampler';

  constructor(public readonly descriptor: GPUSamplerDescriptor) {
    super();
    if (descriptor.compare === undefined) this._type = 'sampler';
    else this._type = 'sampler_comparison';
  }
  get type() {
    return this._type;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this.label);

    ctx.addRenderResource(this, identifier);

    return ctx.resolve(identifier);
  }
}

export function isSampler(
  resource: WgslRenderResource,
): resource is WgslSampler {
  return resource.type === 'sampler' || resource.type === 'sampler_comparison';
}

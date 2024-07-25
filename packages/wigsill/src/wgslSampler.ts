import type {
  ResolutionCtx,
  WgslRenderResource,
  WgslRenderResourceType,
  WgslSamplerType,
} from './types';
import { WgslIdentifier } from './wgslIdentifier';

export interface WgslSampler extends WgslRenderResource<WgslSamplerType> {}

export function sampler(descriptor: GPUSamplerDescriptor): WgslSampler {
  return new WgslSamplerImpl(descriptor);
}

class WgslSamplerImpl implements WgslSampler {
  private _label: string | undefined;
  private _type: WgslRenderResourceType;

  constructor(private readonly _descriptor: GPUSamplerDescriptor) {
    if (_descriptor.compare === null) this._type = 'sampler';
    else this._type = 'sampler_comparison';
  }

  get label() {
    return this._label;
  }

  get descriptor() {
    return this._descriptor;
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

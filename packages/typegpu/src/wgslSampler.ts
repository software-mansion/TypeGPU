import { namable, resolvable } from './decorators';
import type {
  ResolutionCtx,
  WgslNamable,
  WgslRenderResource,
  WgslSamplerType,
} from './types';
import { makeIdentifier } from './wgslIdentifier';

export interface WgslSampler extends WgslRenderResource, WgslNamable {
  readonly descriptor: GPUSamplerDescriptor;
}

export function sampler(descriptor: GPUSamplerDescriptor): WgslSampler {
  return makeSampler(descriptor);
}

function resolveSampler(this: WgslSampler, ctx: ResolutionCtx) {
  const identifier = makeIdentifier().$name(this.label);
  ctx.addRenderResource(this, identifier);
  return ctx.resolve(identifier);
}

const makeSampler = (descriptor: GPUSamplerDescriptor) =>
  namable(
    resolvable(
      { typeInfo: 'sampler' },
      {
        type: (descriptor.compare === undefined
          ? 'sampler'
          : 'sampler_comparison') as WgslSamplerType,
        resolve: resolveSampler,
        descriptor,
      },
    ),
  );

export function isSampler(
  resource: WgslRenderResource,
): resource is WgslSampler {
  return resource.type === 'sampler' || resource.type === 'sampler_comparison';
}

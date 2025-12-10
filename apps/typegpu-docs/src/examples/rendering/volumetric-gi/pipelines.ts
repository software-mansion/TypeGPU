import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { presentationFormat, root } from './root.ts';
import { castAndMerge } from './common.ts';
import { fullScreenTriangle } from 'typegpu/common';
import { exposure, gammaSRGB, tonemapACES } from './image.ts';

export const bindGroupLayoutABC = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
});

export const iFrameUniform = root.createUniform(d.u32);
export const cascadeIndexBuffer = root.createUniform(d.i32);
export const iTimeBuffer = root.createUniform(d.f32);
export const iResolutionBuffer = root.createUniform(d.vec3f);

const fragmentFnABC = tgpu['~unstable'].fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(
  ({ pos }) => {
    return castAndMerge(
      bindGroupLayoutABC.$.iChannel0,
      cascadeIndexBuffer.$,
      pos.xy,
      iResolutionBuffer.$.xy,
      iTimeBuffer.$,
    );
  },
);

export const pipelineABC = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(fragmentFnABC, { format: presentationFormat })
  .createPipeline();

export const bindGroupLayoutImage = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
});

const fragmentFnImage = tgpu['~unstable'].fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(({ pos }) => {
  let luminance =
    std.textureLoad(bindGroupLayoutImage.$.iChannel0, d.vec2i(pos.xy), 0).xyz;
  luminance = luminance.mul(std.exp2(exposure));
  luminance = tonemapACES(luminance);
  luminance = gammaSRGB(luminance);
  return d.vec4f(luminance, 1.0);
});

export const pipelineImage = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(fragmentFnImage, { format: presentationFormat })
  .createPipeline();

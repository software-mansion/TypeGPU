import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { intermediateFormat, presentationFormat, root } from './root.ts';
import { castAndMerge } from './common.ts';
import { fullScreenTriangle } from 'typegpu/common';
import { exposure, gammaSRGB, tonemapACES } from './image.ts';

// buffers

export const cascadeIndexUniform = root.createUniform(d.i32);
export const timeUniform = root.createUniform(d.f32);
export const resolutionUniform = root.createUniform(d.vec3f);
export const bilinearFix = root.createUniform(d.u32, 1);

// cast and merge

export const castAndMergeLayout = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
});

const castAndMergeFragment = tgpu['~unstable'].fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(
  ({ pos }) => {
    return castAndMerge(
      castAndMergeLayout.$.iChannel0,
      cascadeIndexUniform.$,
      pos.xy,
      resolutionUniform.$.xy,
      timeUniform.$,
      bilinearFix.$,
    );
  },
);

export const castAndMergePipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(castAndMergeFragment, { format: intermediateFormat })
  .createPipeline();

// image

export const imageLayout = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
});

const imageFragment = tgpu['~unstable'].fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(({ pos }) => {
  let luminance =
    std.textureLoad(imageLayout.$.iChannel0, d.vec2i(pos.xy), 0).xyz;
  luminance = luminance.mul(std.exp2(exposure));
  luminance = tonemapACES(luminance);
  luminance = gammaSRGB(luminance);
  return d.vec4f(luminance, 1.0);
});

export const imagePipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(imageFragment, { format: presentationFormat })
  .createPipeline();

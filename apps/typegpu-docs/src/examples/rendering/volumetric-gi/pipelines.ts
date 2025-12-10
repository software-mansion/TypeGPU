import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { presentationFormat, root } from './root.ts';
import { castAndMerge } from './common.ts';
import { fullScreenTriangle } from 'typegpu/common';

export const bindGroupLayoutABC = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
});

export const iFrameUniform = root.createUniform(d.u32);
export const cascadeIndexBuffer = root.createUniform(d.vec2i);
export const iTimeBuffer = root.createUniform(d.f32);
export const iResolutionBuffer = root.createUniform(d.vec3f);

const fragmentFnABC = tgpu['~unstable'].fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(
  ({ pos }) => {
    if (iFrameUniform.$ % 2 === 0) {
      return castAndMerge(
        bindGroupLayoutABC.$.iChannel0,
        cascadeIndexBuffer.$.x,
        pos.xy,
        iResolutionBuffer.$.xy,
        iTimeBuffer.$,
      );
    }
    return castAndMerge(
      bindGroupLayoutABC.$.iChannel0,
      cascadeIndexBuffer.$.y,
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

export const bindGroupLayoutD = tgpu.bindGroupLayout({
  iChannel0: { texture: d.texture2d() },
  iChannel1: { texture: d.texture2d() },
});

const fragmentFnD = tgpu['~unstable'].fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(
  ({ pos }) => {
    if (iFrameUniform.$ % 2 === 0) {
      return std.textureLoad(
        bindGroupLayoutD.$.iChannel1,
        d.vec2i(pos.xy),
        0,
      );
    }
    return std.textureLoad(bindGroupLayoutD.$.iChannel0, d.vec2i(pos.xy), 0);
  },
);

export const pipelineD = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(fragmentFnD, { format: presentationFormat })
  .createPipeline();

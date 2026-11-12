import { d, std, tgpu } from 'typegpu';
import { layout } from './gBuffer.ts';

export const lightingFragmentFn = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  return std.textureSample(layout.$.albedo, layout.$.sampler, uv);
});

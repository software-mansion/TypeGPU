import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { samplerSlot, textureLayout, uvTransformUniformSlot } from './schemas';

export const mainFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.location(0, d.vec2f), pos: d.builtin.position },
  out: d.vec4f,
})((input) => {
  const uv2 = uvTransformUniformSlot.$.mul(input.uv.sub(0.5)).add(0.5);
  const col = std.textureSampleBaseClampToEdge(
    textureLayout.$.inputTexture,
    samplerSlot.$,
    uv2,
  );

  const mask = std.textureSampleBaseClampToEdge(
    textureLayout.$.maskTexture,
    samplerSlot.$,
    uv2,
  ).x;
  if (mask < 0.2) {
    return d.vec4f(0, 0, 0, 1);
  }
  return col;
});

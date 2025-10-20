import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { samplerSlot, textureLayout } from './schemas';

export const mainFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.location(0, d.vec2f), pos: d.builtin.position },
  out: d.vec4f,
})((input) => {
  const col = std.textureSampleBaseClampToEdge(
    textureLayout.$.inputTexture,
    samplerSlot.$,
    input.uv,
  );

  const mask = std.textureSampleBaseClampToEdge(
    textureLayout.$.maskTexture,
    samplerSlot.$,
    input.uv,
  ).x;
  if (mask < 0.2) {
    return d.vec4f(0, 0, 0, 1);
  }
  return col;
});

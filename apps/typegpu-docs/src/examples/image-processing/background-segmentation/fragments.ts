import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  downscaleLayout,
  externalTextureLayout,
  samplerSlot,
  textureLayout,
} from './schemas';

export const downscale = (x: number, y: number) => {
  'use gpu';
  const col = std.textureSampleBaseClampToEdge(
    downscaleLayout.$.inputTexture,
    downscaleLayout.$.sampler,
    d.vec2f(d.f32(x), d.f32(y)).div(255),
  );

  downscaleLayout.$.outputBuffer[0 * 256 * 256 + y * 256 + x] = col.x;
  downscaleLayout.$.outputBuffer[1 * 256 * 256 + y * 256 + x] = col.y;
  downscaleLayout.$.outputBuffer[2 * 256 * 256 + y * 256 + x] = col.z;
};

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

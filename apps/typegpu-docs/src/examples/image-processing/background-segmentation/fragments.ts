import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  downscaleLayout,
  externalTextureLayout,
  samplerSlot,
  textureLayout,
} from './schemas';

export const downscaleFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f, pos: d.builtin.position },
  out: d.vec4f,
})(({ uv, pos }) => {
  const col = std.textureSampleBaseClampToEdge(
    downscaleLayout.$.inputTexture,
    samplerSlot.$,
    uv,
  );

  const x = d.u32(pos.x);
  const y = d.u32(pos.y);

  downscaleLayout.$.outputBuffer[0 * 256 * 256 + y * 256 + x] = col.x;
  downscaleLayout.$.outputBuffer[1 * 256 * 256 + y * 256 + x] = col.y;
  downscaleLayout.$.outputBuffer[2 * 256 * 256 + y * 256 + x] = col.z;

  return col;
  // return d.vec4f(1, 1, 0, 1);
});

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

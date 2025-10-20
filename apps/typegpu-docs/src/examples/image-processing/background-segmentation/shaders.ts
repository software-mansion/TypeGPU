import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  drawWithMaskLayout,
  prepareModelInputLayout,
  samplerSlot,
} from './schemas';

export const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})`{
  const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
  return Out(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
}`;

export const prepareModelInput = (x: number, y: number) => {
  'use gpu';
  const col = std.textureSampleBaseClampToEdge(
    prepareModelInputLayout.$.inputTexture,
    prepareModelInputLayout.$.sampler,
    d.vec2f(d.f32(x), d.f32(y)).div(255),
  );

  prepareModelInputLayout.$.outputBuffer[0 * 256 * 256 + y * 256 + x] = col.x;
  prepareModelInputLayout.$.outputBuffer[1 * 256 * 256 + y * 256 + x] = col.y;
  prepareModelInputLayout.$.outputBuffer[2 * 256 * 256 + y * 256 + x] = col.z;
};

export const drawWithMaskFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.location(0, d.vec2f), pos: d.builtin.position },
  out: d.vec4f,
})((input) => {
  const col = std.textureSampleBaseClampToEdge(
    drawWithMaskLayout.$.inputTexture,
    samplerSlot.$,
    input.uv,
  );

  const mask = std.textureSampleBaseClampToEdge(
    drawWithMaskLayout.$.maskTexture,
    samplerSlot.$,
    input.uv,
  ).x;
  if (mask < 0.2) {
    return d.vec4f(0, 0, 0, 1);
  }
  return col;
});

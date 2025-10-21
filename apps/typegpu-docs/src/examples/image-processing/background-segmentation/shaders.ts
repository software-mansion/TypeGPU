import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  drawWithMaskLayout,
  generateMaskLayout,
  prepareModelInputLayout,
} from './schemas.ts';
import { MODEL_HEIGHT, MODEL_WIDTH } from './model.ts';

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
    d.vec2f(d.f32(x), d.f32(y)).div(d.vec2f(MODEL_WIDTH, MODEL_HEIGHT)),
  );

  prepareModelInputLayout.$
    .outputBuffer[0 * MODEL_WIDTH * MODEL_HEIGHT + y * MODEL_WIDTH + x] = col.x;
  prepareModelInputLayout.$
    .outputBuffer[1 * MODEL_WIDTH * MODEL_HEIGHT + y * MODEL_WIDTH + x] = col.y;
  prepareModelInputLayout.$
    .outputBuffer[2 * MODEL_WIDTH * MODEL_HEIGHT + y * MODEL_WIDTH + x] = col.z;
};

export const generateMaskFromOutput = (x: number, y: number) => {
  'use gpu';
  const color = generateMaskLayout.$.outputBuffer[y * MODEL_WIDTH + x];
  std.textureStore(
    generateMaskLayout.$.maskTexture,
    d.vec2u(x, y),
    d.vec4f(color),
  );
};

export const drawWithMaskFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.location(0, d.vec2f), pos: d.builtin.position },
  out: d.vec4f,
})((input) => {
  const col = std.textureSampleBaseClampToEdge(
    drawWithMaskLayout.$.inputTexture,
    drawWithMaskLayout.$.sampler,
    input.uv,
  );

  const mask = std.textureSampleBaseClampToEdge(
    drawWithMaskLayout.$.maskTexture,
    drawWithMaskLayout.$.sampler,
    input.uv,
  ).x;

  return d.vec4f(col.xyz.mul(mask), 1);
});

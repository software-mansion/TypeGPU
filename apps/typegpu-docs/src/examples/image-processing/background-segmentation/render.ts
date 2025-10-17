import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  externalTextureLayout,
  samplerSlot,
  textureLayout,
  uvTransformUniformSlot,
} from './schemas';

const vertexPos = tgpu.const(d.arrayOf(d.vec2f, 6), [
  d.vec2f(1.0, 1.0),
  d.vec2f(1.0, -1.0),
  d.vec2f(-1.0, -1.0),
  d.vec2f(1.0, 1.0),
  d.vec2f(-1.0, -1.0),
  d.vec2f(-1.0, 1.0),
]);

const uv = tgpu.const(d.arrayOf(d.vec2f, 6), [
  d.vec2f(1.0, 0.0),
  d.vec2f(1.0, 1.0),
  d.vec2f(0.0, 1.0),
  d.vec2f(1.0, 0.0),
  d.vec2f(0.0, 1.0),
  d.vec2f(0.0, 0.0),
]);

export const mainVert = tgpu['~unstable'].vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.location(0, d.vec2f) },
})((input, Out) => {
  const output = Out();
  output.position = d.vec4f(vertexPos.$[input.idx], 0.0, 1.0);
  output.uv = uv.$[input.idx];
  return output;
});

export const mainFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.location(0, d.vec2f) },
  out: d.vec4f,
})((input) => {
  const uv2 = uvTransformUniformSlot.$.mul(input.uv.sub(0.5)).add(0.5);
  const col = std.textureSampleBaseClampToEdge(
    textureLayout.$.inputTexture,
    samplerSlot.$,
    uv2,
  );

  return col;
});

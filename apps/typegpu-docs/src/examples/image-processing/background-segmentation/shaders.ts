import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  blurLayout,
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

const tileData = tgpu.workgroupVar(d.arrayOf(d.arrayOf(d.vec3f, 128), 4));
export const computeFn = tgpu['~unstable'].computeFn({
  in: { wid: d.builtin.workgroupId, lid: d.builtin.localInvocationId },
  workgroupSize: [32, 1, 1],
})(({ wid, lid }) => {
  const settings = blurLayout.$.settings;
  const filterOffset = d.i32((settings.filterDim - 1) / 2);
  const dims = d.vec2i(std.textureDimensions(blurLayout.$.inTexture));
  const baseIndex = d.vec2i(
    wid.xy.mul(d.vec2u(settings.blockDim, 4)).add(lid.xy.mul(d.vec2u(4, 1))),
  ).sub(d.vec2i(filterOffset, 0));

  // Load a tile of pixels into shared memory
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let loadIndex = baseIndex.add(d.vec2i(c, r));
      if (blurLayout.$.flip !== 0) {
        loadIndex = loadIndex.yx;
      }

      tileData.$[r][lid.x * 4 + d.u32(c)] = std.textureSampleLevel(
        blurLayout.$.inTexture,
        blurLayout.$.sampler,
        d.vec2f(d.vec2f(loadIndex).add(d.vec2f(0.5)).div(d.vec2f(dims))),
        0,
      ).xyz;
    }
  }

  std.workgroupBarrier();

  // Apply the horizontal blur filter and write to the output texture
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let writeIndex = baseIndex.add(d.vec2i(c, r));
      if (blurLayout.$.flip !== 0) {
        writeIndex = writeIndex.yx;
      }

      const center = d.i32(4 * lid.x) + c;
      if (
        center >= filterOffset &&
        center < 128 - filterOffset &&
        std.all(std.lt(writeIndex, dims))
      ) {
        let acc = d.vec3f();
        for (let f = 0; f < settings.filterDim; f++) {
          const i = center + f - filterOffset;
          acc = acc.add(tileData.$[r][i].mul(1 / settings.filterDim));
        }
        std.textureStore(blurLayout.$.outTexture, writeIndex, d.vec4f(acc, 1));
      }
    }
  }
});

export const drawWithMaskFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.location(0, d.vec2f), pos: d.builtin.position },
  out: d.vec4f,
})((input) => {
  const originalColor = std.textureSampleBaseClampToEdge(
    drawWithMaskLayout.$.inputTexture,
    drawWithMaskLayout.$.sampler,
    input.uv,
  );

  const blurredColor = std.textureSampleBaseClampToEdge(
    drawWithMaskLayout.$.inputBlurredTexture,
    drawWithMaskLayout.$.sampler,
    input.uv,
  );

  const mask = std.textureSampleBaseClampToEdge(
    drawWithMaskLayout.$.maskTexture,
    drawWithMaskLayout.$.sampler,
    input.uv,
  ).x;

  return std.mix(blurredColor, originalColor, mask);
});

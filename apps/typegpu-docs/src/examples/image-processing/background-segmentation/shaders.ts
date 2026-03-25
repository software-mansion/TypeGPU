import tgpu, { d, std } from 'typegpu';
import { MODEL_HEIGHT, MODEL_WIDTH } from './model.ts';
import {
  blockDim,
  blurLayout,
  drawWithMaskLayout,
  filterDim,
  flipAccess,
  generateMaskLayout,
  paramsAccess,
  prepareModelInputLayout,
} from './schemas.ts';

export const prepareModelInput = (x: number, y: number) => {
  'use gpu';
  const modelUV = d.vec2f(x, y).div(d.vec2f(MODEL_WIDTH, MODEL_HEIGHT));

  const cropBounds = paramsAccess.$.cropBounds;
  const uvMin = cropBounds.xy;
  const uvMax = cropBounds.zw;
  const videoUV = std.mix(uvMin, uvMax, modelUV);

  const col = std.textureSampleBaseClampToEdge(
    prepareModelInputLayout.$.inputTexture,
    prepareModelInputLayout.$.sampler,
    videoUV,
  );

  prepareModelInputLayout.$.outputBuffer[y * MODEL_WIDTH + x] = col.x;
  prepareModelInputLayout.$.outputBuffer[1 * MODEL_WIDTH * MODEL_HEIGHT + y * MODEL_WIDTH + x] =
    col.y;
  prepareModelInputLayout.$.outputBuffer[2 * MODEL_WIDTH * MODEL_HEIGHT + y * MODEL_WIDTH + x] =
    col.z;
};

export const generateMaskFromOutput = (x: number, y: number) => {
  'use gpu';
  const color = generateMaskLayout.$.outputBuffer[y * MODEL_WIDTH + x];
  std.textureStore(generateMaskLayout.$.maskTexture, d.vec2u(x, y), d.vec4f(color));
};

const tileData = tgpu.workgroupVar(d.arrayOf(d.arrayOf(d.vec3f, 128), 4));
export const computeFn = tgpu.computeFn({
  in: { wid: d.builtin.workgroupId, lid: d.builtin.localInvocationId },
  workgroupSize: [32, 1, 1],
})(({ wid, lid }) => {
  'use gpu';
  const filterOffset = d.i32((filterDim - 1) / 2);
  const dims = d.vec2i(std.textureDimensions(blurLayout.$.inTexture));
  const baseIndex =
    d.vec2i(wid.xy * d.vec2u(blockDim, 4) + lid.xy * d.vec2u(4, 1)) - d.vec2i(filterOffset, 0);

  // Load a tile of pixels into shared memory
  for (const r of tgpu.unroll([0, 1, 2, 3])) {
    for (const c of tgpu.unroll([0, 1, 2, 3])) {
      let loadIndex = baseIndex + d.vec2i(c, r);
      if (flipAccess.$) {
        loadIndex = loadIndex.yx;
      }

      tileData.$[r][lid.x * 4 + d.u32(c)] = std.textureSampleLevel(
        blurLayout.$.inTexture,
        blurLayout.$.sampler,
        (d.vec2f(loadIndex) + 0.5) / d.vec2f(dims),
        0,
      ).rgb;
    }
  }

  std.workgroupBarrier();

  // Apply the horizontal blur filter and write to the output texture
  for (const r of tgpu.unroll([0, 1, 2, 3])) {
    for (const c of tgpu.unroll([0, 1, 2, 3])) {
      let writeIndex = baseIndex + d.vec2i(c, r);
      if (flipAccess.$) {
        writeIndex = writeIndex.yx;
      }

      const center = d.i32(4 * lid.x) + c;
      if (
        center >= filterOffset &&
        center < 128 - filterOffset &&
        std.all(std.lt(writeIndex, dims))
      ) {
        let acc = d.vec3f();
        for (let f = 0; f < filterDim; f++) {
          const i = center + f - filterOffset;
          acc += tileData.$[r][i] / filterDim;
        }
        std.textureStore(blurLayout.$.outTexture, writeIndex, d.vec4f(acc, 1));
      }
    }
  }
});

export const fragmentFn = (input: { uv: d.v2f }) => {
  'use gpu';
  const uv = input.uv;
  const originalColor = std.textureSampleBaseClampToEdge(
    drawWithMaskLayout.$.inputTexture,
    drawWithMaskLayout.$.sampler,
    uv,
  );

  let blurredColor = d.vec4f();
  if (paramsAccess.$.useGaussian === 1) {
    blurredColor = std.textureSampleBaseClampToEdge(
      drawWithMaskLayout.$.inputBlurredTexture,
      drawWithMaskLayout.$.sampler,
      uv,
    );
  } else {
    blurredColor = std.textureSampleBias(
      drawWithMaskLayout.$.inputBlurredTexture,
      drawWithMaskLayout.$.sampler,
      uv,
      paramsAccess.$.sampleBias,
    );
  }

  const cropBounds = paramsAccess.$.cropBounds;
  const uvMin = cropBounds.xy;
  const uvMax = cropBounds.zw;
  const maskUV = d.vec2f(uv).sub(uvMin).div(uvMax.sub(uvMin));
  const sampledMask = std.textureSampleBaseClampToEdge(
    drawWithMaskLayout.$.maskTexture,
    drawWithMaskLayout.$.sampler,
    maskUV,
  ).x;

  const inCropRegion = uv.x >= uvMin.x && uv.x <= uvMax.x && uv.y >= uvMin.y && uv.y <= uvMax.y;
  // use mask only inside the crop region
  const mask = std.select(0, sampledMask, inCropRegion);

  return std.mix(blurredColor, originalColor, mask);
};

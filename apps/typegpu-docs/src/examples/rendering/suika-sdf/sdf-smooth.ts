import tgpu, { d, std } from 'typegpu';
import type { SampledFlag, TgpuRoot, TgpuSampler, TgpuTexture } from 'typegpu';
import { LEVEL_COUNT } from './constants.ts';
import { SPRITE_SIZE } from './sdf-gen.ts';

export function createSmoothedSdf(
  root: TgpuRoot,
  sdfTexture: TgpuTexture & SampledFlag,
  linSampler: TgpuSampler,
) {
  const sdfView = sdfTexture.createView(d.texture2dArray());

  const smoothSdfTexture = root['~unstable']
    .createTexture({
      size: [SPRITE_SIZE, SPRITE_SIZE, LEVEL_COUNT],
      format: 'rgba16float',
    })
    .$usage('sampled', 'storage');
  const smoothSdfReadView = smoothSdfTexture.createView(d.texture2dArray());
  const smoothSdfWriteView = smoothSdfTexture.createView(
    d.textureStorage2dArray('rgba16float', 'write-only'),
  );

  const levelUniform = root.createUniform(d.u32, 0);

  const sampleSdfRaw = (uv: d.v2f, level: number) => {
    'use gpu';
    return std.textureSampleLevel(sdfView.$, linSampler.$, uv, level, d.f32(0))
      .x;
  };

  const smoothSdfPipeline = root.createGuardedComputePipeline(
    (x: number, y: number) => {
      'use gpu';
      const lv = levelUniform.$;
      const uv = (d.vec2f(x, y) + 0.5) / SPRITE_SIZE;
      const t = 5 / SPRITE_SIZE;

      // 3×3 Gaussian [1,2,1; 2,4,2; 1,2,1] / 16
      let accum = d.f32(0);
      for (const dy of tgpu.unroll([-1, 0, 1])) {
        for (const dx of tgpu.unroll([-1, 0, 1])) {
          const w = d.f32((2 - std.abs(dy)) * (2 - std.abs(dx)));
          accum += sampleSdfRaw(uv + d.vec2f(dx, dy) * t, lv) * w;
        }
      }

      std.textureStore(
        smoothSdfWriteView.$,
        d.vec2i(x, y),
        lv,
        d.vec4f(accum / 16, 0, 0, 1),
      );
    },
  );

  for (let level = 0; level < LEVEL_COUNT; level++) {
    levelUniform.write(level);
    smoothSdfPipeline.dispatchThreads(SPRITE_SIZE, SPRITE_SIZE);
  }

  return smoothSdfReadView;
}

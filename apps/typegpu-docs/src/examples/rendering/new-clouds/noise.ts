import { perlin3d, randf } from '@typegpu/noise';
import { tgpu, d, std, type TgpuRoot } from 'typegpu';

const NOISE_TEXTURE_SIZE = 128;
const channelToSeed = {
  r: 2 / 11,
  g: 3 / 11,
  b: 5 / 11,
  a: 7 / 11,
} as const;

const worley = tgpu.fn(
  [d.vec3f, d.i32, d.f32],
  d.f32,
)((pos, cells, seedW) => {
  'use gpu';
  const gridPosition = pos * d.f32(cells);
  const cell = d.vec3i(std.floor(gridPosition));

  let nearestDistanceSquared = d.f32(9);

  for (const dx of tgpu.unroll([-1, 0, 1])) {
    for (const dy of tgpu.unroll([-1, 0, 1])) {
      for (const dz of tgpu.unroll([-1, 0, 1])) {
        const neighborCell = cell + d.vec3i(dx, dy, dz);
        const wrappedCell = (neighborCell + cells) % cells;

        randf.seed4(d.vec4f(d.vec3f(wrappedCell), seedW));
        const featurePoint = d.vec3f(neighborCell) + randf.inUnitCube();
        const toFeaturePoint = featurePoint - gridPosition;

        nearestDistanceSquared = std.min(
          nearestDistanceSquared,
          std.dot(toFeaturePoint, toFeaturePoint),
        );
      }
    }
  }

  return std.sqrt(nearestDistanceSquared);
});

const octavesAccessor = tgpu.accessor(d.u32);
const noiseSlot = tgpu.slot<(pos: d.v3f) => number>();
const getMaxValue = tgpu.comptime((octaves: number) => 1 - 2 ** -octaves);
const rotation = d.mat3x3f(1.6, 1.2, 0, -1.2, 1.6, 0, 0, 0, 1); // * 2.0 included

const fbm = tgpu.fn(
  [d.vec3f],
  d.f32,
)((pos) => {
  'use gpu';
  let f = d.f32();
  let u = d.vec3f(pos);

  for (const i of tgpu.unroll(std.range(octavesAccessor.$))) {
    let sample = noiseSlot.$(u);
    f += 0.5 ** i * sample;
    u = rotation * u;
  }

  return f / getMaxValue(octavesAccessor.$);
});

const fbm4perlin = fbm.with(octavesAccessor, 4).with(noiseSlot, perlin3d.sample);

const overlayThreeInDescendingOrder = tgpu.fn(
  [d.f32, d.f32, d.f32],
  d.f32,
)((v1, v2, v3) => {
  'use gpu';
  return (v1 + v2 * 0.3 + v3 * 0.09) / 1.39;
});

export function precomputeNoiseTexture(root: TgpuRoot) {
  const cache = perlin3d.staticCache({ root, size: d.vec3u(8, 8, 8) });
  const noiseTexture = root
    .createTexture({
      size: [NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE],
      format: 'rgba8unorm',
      dimension: '3d',
    })
    .$usage('sampled', 'storage');

  const noiseTextureWriteView = noiseTexture.createView(d.textureStorage3d('rgba8unorm'));
  const generateWorley = root.pipe(cache.inject()).createGuardedComputePipeline((x, y, z) => {
    'use gpu';

    const result = d.vec4f(0, 0, 0, 1);

    const voxelPos = (d.vec3f(x, y, z) + 0.5) / NOISE_TEXTURE_SIZE;
    result.r = fbm4perlin(voxelPos * 8) * 0.5 + 0.5;

    const worleyLow = worley(voxelPos, 8, channelToSeed.g);
    const worleyMid = worley(voxelPos, 16, channelToSeed.b);
    const worleyHigh = worley(voxelPos, 24, channelToSeed.a);

    result.g = std.max(1 - overlayThreeInDescendingOrder(worleyLow, worleyMid, worleyHigh), 0);
    result.b = std.max(1 - overlayThreeInDescendingOrder(worleyMid, worleyHigh, worleyLow), 0);
    result.a = std.max(1 - overlayThreeInDescendingOrder(worleyHigh, worleyLow, worleyMid), 0);

    std.textureStore(noiseTextureWriteView.$, d.vec3u(x, y, z), result);
  });

  generateWorley.dispatchThreads(NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE);

  return noiseTexture;
}

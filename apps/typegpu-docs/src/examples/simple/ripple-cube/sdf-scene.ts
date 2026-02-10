import * as sdf from '@typegpu/sdf';
import tgpu, { d, std, type TgpuRoot, type TgpuUniform } from 'typegpu';
import { GRID_SIZE, SHADOW_SOFTNESS, SURF_DIST } from './constants.ts';

export const timeAccess = tgpu['~unstable'].accessor(d.f32);
export const blendFactorAccess = tgpu['~unstable'].accessor(d.f32);

export const sdfLayout = tgpu.bindGroupLayout({
  sdfTexture: { texture: d.texture3d(d.f32) },
  sdfSampler: { sampler: 'filtering' },
});

export const sceneSDF = (p: d.v3f): number => {
  'use gpu';
  const uv = p.add(0.5);
  const sdfValue = std.textureSampleLevel(
    sdfLayout.$.sdfTexture,
    sdfLayout.$.sdfSampler,
    uv,
    0,
  ).x;

  const interior = std.max(sdf.sdBox3d(p, d.vec3f(0.5)), sdfValue);
  return std.min(sdf.sdBoxFrame3d(p, d.vec3f(0.5), 0.005), interior);
};

export function createSDFPrecalculator(
  root: TgpuRoot,
  timeUniform: TgpuUniform<d.F32>,
  blendFactorUniform: TgpuUniform<d.F32>,
) {
  const texture = root['~unstable']
    .createTexture({
      size: [GRID_SIZE, GRID_SIZE, GRID_SIZE],
      format: 'rgba16float',
      dimension: '3d',
    })
    .$usage('sampled', 'storage');

  const writeView = texture.createView(d.textureStorage3d('rgba16float'));

  const sampler = root['~unstable'].createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const sdfBindGroup = root.createBindGroup(sdfLayout, {
    sdfTexture: texture,
    sdfSampler: sampler,
  });

  const pipeline = root['~unstable']
    .with(timeAccess, timeUniform)
    .with(blendFactorAccess, blendFactorUniform)
    .createGuardedComputePipeline((x, y, z) => {
      'use gpu';
      const cellSize = 1 / GRID_SIZE;
      const p = d.vec3f(x, y, z).add(0.5).mul(cellSize).sub(0.5);

      const r = timeAccess.$ * 0.15;
      const px = [p.x, 1 - p.x, -1 - p.x, p.x + 2, p.x - 2];
      const py = [p.y, 1 - p.y, -1 - p.y, p.y + 2, p.y - 2];
      const pz = [p.z, 1 - p.z, -1 - p.z, p.z + 2, p.z - 2];

      let shellD = d.f32(1e10);
      for (let ix = 0; ix < 4; ix++) {
        for (let iy = 0; iy < 4; iy++) {
          for (let iz = 0; iz < 4; iz++) {
            const q = d.vec3f(px[ix], py[iy], pz[iz]);
            shellD = sdf.opSmoothUnion(
              shellD,
              std.abs(std.length(q) - r) - 0.005,
              blendFactorAccess.$,
            );
          }
        }
      }

      std.textureStore(
        writeView.$,
        d.vec3u(x, y, z),
        d.vec4f(shellD, 0, 0, 1),
      );
    });

  function precalculate() {
    pipeline.dispatchThreads(GRID_SIZE, GRID_SIZE, GRID_SIZE);
  }

  function destroy() {
    texture.destroy();
  }

  return { sdfBindGroup, precalculate, destroy };
}

export const getNormal = (p: d.v3f): d.v3f => {
  'use gpu';
  const e = 0.001;
  const dist = sceneSDF(p);
  return std.normalize(
    d.vec3f(
      sceneSDF(p.add(d.vec3f(e, 0, 0))) - dist,
      sceneSDF(p.add(d.vec3f(0, e, 0))) - dist,
      sceneSDF(p.add(d.vec3f(0, 0, e))) - dist,
    ),
  );
};

export const softShadow = (ro: d.v3f, rd: d.v3f, maxDist: number): number => {
  'use gpu';
  let result = d.f32(1);
  let t = d.f32(0.02);

  for (let i = 0; i < 32; i++) {
    const p = ro.add(rd.mul(t));
    const dist = sceneSDF(p);

    if (dist < SURF_DIST) {
      return 0;
    }
    if (t > maxDist) {
      break;
    }

    result = std.min(result, (SHADOW_SOFTNESS * dist) / t);
    t += std.max(dist, 0.01);
  }

  return std.clamp(result, 0, 1);
};

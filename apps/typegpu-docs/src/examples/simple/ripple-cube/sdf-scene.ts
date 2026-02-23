import * as sdf from '@typegpu/sdf';
import tgpu, { d, std } from 'typegpu';

export const timeAccess = tgpu.accessor(d.f32);
export const blendFactorAccess = tgpu.accessor(d.f32);

export const sdfLayout = tgpu.bindGroupLayout({
  sdfTexture: { texture: d.texture3d() },
  sdfSampler: { sampler: 'filtering' },
});

export const sceneSDF = (p: d.v3f): number => {
  'use gpu';
  const uv = std.abs(p).mul(2);
  const sdfValue = std.textureSampleLevel(
    sdfLayout.$.sdfTexture,
    sdfLayout.$.sdfSampler,
    uv,
    0,
  ).x;

  const interior = std.max(sdf.sdBox3d(p, d.vec3f(0.5)), sdfValue);
  return std.min(sdf.sdBoxFrame3d(p, d.vec3f(0.5), 0.005), interior);
};

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

import { d, tgpu } from 'typegpu';

export const ModelVertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  uv: d.vec2f,
});

export const modelVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertex));

export const Material = d.struct({
  albedo: d.vec3f,
  normal: d.vec3f,
  ao: d.f32,
  roughness: d.f32,
  metallic: d.f32,
});

export const View = {
  lit: 0,
  albedo: 1,
  weights: 2,
  projectionX: 3,
  projectionY: 4,
  projectionZ: 5,
  normal: 6,
} as const;

export type ViewMode = keyof typeof View;

export const Params = d.struct({
  triplanarScale: d.f32,
  uvScale: d.f32,
  sharpness: d.f32,
  materialNormalRatio: d.f32,
  view: d.u32,
  lightDir: d.vec3f,
});

export const INITIAL_PARAMS: d.InferInput<typeof Params> = {
  triplanarScale: 1.3,
  uvScale: 5,
  sharpness: 8,
  materialNormalRatio: 0.7,
  view: View.lit,
  lightDir: [-0.4, 0.2, -0.35],
};

export const MATERIAL_IDS = [
  'rocks',
  'bricks',
  'beach',
  'aerial-rocks',
  'acoustic-foam',
  'manhole-cover',
] as const;

export type MaterialId = (typeof MATERIAL_IDS)[number];

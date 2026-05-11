import tgpu, { d } from 'typegpu';

export const ModelVertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  uv: d.vec2f,
  tangent: d.vec4f,
});

export const modelVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertex));

export const VertexOutput = {
  clipPosition: d.builtin.position,
  worldPos: d.vec3f,
  worldNormal: d.vec3f,
  worldTangent: d.vec4f,
  uv: d.vec2f,
} as const;

export const TriplanarParams = d.struct({
  triplanarScale: d.f32,
  uvScale: d.f32,
  sharpness: d.f32,
  materialNormalRatio: d.f32,
  splitX: d.f32,
  debugMode: d.u32,
  lightDir: d.vec3f,
});

export const VIEW_MODES = [
  'lit',
  'albedo',
  'blend weights',
  'X projection',
  'Y projection',
  'Z projection',
  'normal',
] as const;

export const MATERIAL_IDS = [
  'rocks',
  'bricks',
  'beach',
  'aerial-rocks',
  'acoustic-foam',
  'manhole-cover',
] as const;

export type MaterialId = (typeof MATERIAL_IDS)[number];

export const DEFAULT_MATERIAL: MaterialId = 'rocks';

export const INITIAL_PARAMS: d.InferInput<typeof TriplanarParams> = {
  triplanarScale: 1.3,
  uvScale: 5,
  sharpness: 8,
  materialNormalRatio: 0.7,
  splitX: 0.5,
  debugMode: 0,
  lightDir: [-0.4, 0.2, -0.35],
};

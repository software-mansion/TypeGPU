import tgpu, { d } from 'typegpu';

export const Vertex = d.struct({
  position: d.vec3f,
  uv: d.vec2f,
});

export const PomParams = d.struct({
  heightScale: d.f32,
  tiling: d.f32,
  lightDir: d.vec3f,
  parallaxSteps: d.u32,
});

export const INITIAL_SUN_ANGLE = Math.atan2(0.5, 1) + Math.PI;
export const INITIAL_SUN_HEIGHT = 0.05;
export const MIN_SUN_ELEVATION = 0.08;
export const MAX_PARALLAX_STEPS = 128;
export const DEFAULT_PARALLAX_STEPS = 64;

export const MATERIAL_IDS = [
  'bricks',
  'acoustic-foam',
  'beach',
  'aerial-rocks',
  'rocks',
  'manhole-cover',
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

export const DEFAULT_MATERIAL: MaterialId = 'rocks';
export const MATERIAL_LAYER = {
  normal: 0,
  height: 1,
  ao: 2,
  roughness: 3,
  metallic: 4,
} as const;

export const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));

export const planeVertices: d.InferInput<typeof Vertex>[] = [
  { position: [-1, 0, -1], uv: [0, 0] },
  { position: [1, 0, -1], uv: [1, 0] },
  { position: [-1, 0, 1], uv: [0, 1] },
  { position: [1, 0, 1], uv: [1, 1] },
];
export const planeIndices = [0, 2, 1, 1, 2, 3];
export const planeConstants = {
  normal: tgpu.const(d.vec3f, d.vec3f(0, 1, 0)),
  tangent: tgpu.const(d.vec3f, d.vec3f(1, 0, 0)),
};

export function computeLightDir(angle: number, height: number): [number, number, number] {
  const elevation = MIN_SUN_ELEVATION + (Math.PI / 2 - MIN_SUN_ELEVATION) * height;
  const horizontal = Math.cos(elevation);
  return [Math.cos(angle) * horizontal, Math.sin(elevation), Math.sin(angle) * horizontal];
}

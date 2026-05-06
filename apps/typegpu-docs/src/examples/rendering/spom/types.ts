import tgpu, { d } from 'typegpu';

export const SpomVertex = d.struct({
  uv: d.vec2f,
  volumeDepth: d.f32,
});

export const SpomInstance = d.struct({
  origin: d.vec3f,
  size: d.vec2f,
  tangent: d.vec3f,
  bitangent: d.vec3f,
  normal: d.vec3f,
  heightScale: d.f32,
  uvTiling: d.f32,
  materialBase: d.u32,
});

export const SpomParams = d.struct({
  reliefScale: d.f32,
  tiling: d.f32,
  lightDir: d.vec3f,
  parallaxSteps: d.u32,
});

export const INITIAL_SUN_ANGLE = Math.atan2(0.5, 1) + Math.PI;
export const INITIAL_SUN_HEIGHT = 0.05;
export const MIN_SUN_ELEVATION = 0.08;
export const MAX_PARALLAX_STEPS = 128;
export const DEFAULT_PARALLAX_STEPS = 80;

export const SCENE_MATERIAL_IDS = ['beach', 'bricks'] as const;
export type SceneMaterialId = (typeof SCENE_MATERIAL_IDS)[number];

export const MATERIAL_LAYER_STRIDE = 6;
export const SCENE_TEXTURE_LAYER_COUNT = SCENE_MATERIAL_IDS.length * MATERIAL_LAYER_STRIDE;
export const MATERIAL_LAYER = {
  albedo: 0,
  normal: 1,
  height: 2,
  ao: 3,
  roughness: 4,
  metallic: 5,
} as const;

export const spomVertexLayout = tgpu.vertexLayout(d.arrayOf(SpomVertex));
export const spomInstanceLayout = tgpu.vertexLayout(d.arrayOf(SpomInstance), 'instance');

function createSpomGrid(subdivisions: number) {
  const vertices: d.InferInput<typeof SpomVertex>[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= subdivisions; y++) {
    for (let x = 0; x <= subdivisions; x++) {
      vertices.push({
        uv: [x / subdivisions, y / subdivisions],
        volumeDepth: 0,
      });
    }
  }

  for (let y = 0; y < subdivisions; y++) {
    for (let x = 0; x < subdivisions; x++) {
      const a = y * (subdivisions + 1) + x;
      const b = a + 1;
      const c = a + subdivisions + 1;
      const e = c + 1;
      indices.push(a, c, b, b, c, e);
    }
  }

  return { vertices, indices };
}

const spomGrid = createSpomGrid(24);

export const spomVertices = spomGrid.vertices;
export const spomIndices = spomGrid.indices;

const materialBaseLayer = (materialIndex: number) => materialIndex * MATERIAL_LAYER_STRIDE;

export const spomInstances: d.InferInput<typeof SpomInstance>[] = [
  {
    origin: [0, -0.55, 0],
    size: [3.8, 2.8],
    tangent: [1, 0, 0],
    bitangent: [0, 0, 1],
    normal: [0, 1, 0],
    heightScale: 0.025,
    uvTiling: 3.6,
    materialBase: materialBaseLayer(0),
  },
  {
    origin: [0, 0.48, 0],
    size: [0.72, 0.58],
    tangent: [1, 0, 0],
    bitangent: [0, 0, 1],
    normal: [0, 1, 0],
    heightScale: 0.045,
    uvTiling: 1.65,
    materialBase: materialBaseLayer(1),
  },
  {
    origin: [0, 0, 0.58],
    size: [0.72, 0.48],
    tangent: [-1, 0, 0],
    bitangent: [0, 1, 0],
    normal: [0, 0, 1],
    heightScale: 0.012,
    uvTiling: 1.65,
    materialBase: materialBaseLayer(1),
  },
  {
    origin: [0, 0, -0.58],
    size: [0.72, 0.48],
    tangent: [1, 0, 0],
    bitangent: [0, 1, 0],
    normal: [0, 0, -1],
    heightScale: 0.012,
    uvTiling: 1.65,
    materialBase: materialBaseLayer(1),
  },
  {
    origin: [0.72, 0, 0],
    size: [0.58, 0.48],
    tangent: [0, 0, 1],
    bitangent: [0, 1, 0],
    normal: [1, 0, 0],
    heightScale: 0.012,
    uvTiling: 1.65,
    materialBase: materialBaseLayer(1),
  },
  {
    origin: [-0.72, 0, 0],
    size: [0.58, 0.48],
    tangent: [0, 0, -1],
    bitangent: [0, 1, 0],
    normal: [-1, 0, 0],
    heightScale: 0.012,
    uvTiling: 1.65,
    materialBase: materialBaseLayer(1),
  },
  {
    origin: [0, -0.48, 0],
    size: [0.72, 0.58],
    tangent: [1, 0, 0],
    bitangent: [0, 0, -1],
    normal: [0, -1, 0],
    heightScale: 0.025,
    uvTiling: 1.65,
    materialBase: materialBaseLayer(1),
  },
];

export function computeLightDir(angle: number, height: number): [number, number, number] {
  const elevation = MIN_SUN_ELEVATION + (Math.PI / 2 - MIN_SUN_ELEVATION) * height;
  const horizontal = Math.cos(elevation);
  return [Math.cos(angle) * horizontal, Math.sin(elevation), Math.sin(angle) * horizontal];
}

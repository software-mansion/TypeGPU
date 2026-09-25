import { d, std, type TgpuRoot } from 'typegpu';
import { perlin2d as gpuPerlin } from '@typegpu/noise';
import { vec3, type Vec3 } from 'math';
import { fbm, perlin2d, ridged } from 'math/noise';

// #region CPU: the broad shape of the land, with `math/noise`

const hills = perlin2d.create(1337);
const peaks = perlin2d.create(4242);

/**
 * Rolling hills with the occasional ridge line. This is the exact function the walker's
 * feet stand on, and it can be sampled anywhere on the CPU.
 */
export function coarseHeight(x: number, z: number): number {
  const rolling = fbm((f) => perlin2d.sample(hills, (x * f) / 160, (z * f) / 160), 4, 2.05, 0.45);
  const ridges = ridged(
    (f) => perlin2d.sample(peaks, (x * f) / 340 + 50.3, (z * f) / 340 - 17.7),
    3,
    2.2,
    0.45,
  );
  const ridgeMask = perlin2d.sample(peaks, x / 800 + 3.1, z / 800) * 0.5 + 0.5;
  return rolling * 22 + ridges ** 3 * 48 * ridgeMask;
}

export function coarseNormal(out: Vec3, x: number, z: number): Vec3 {
  const e = 0.5;
  vec3.set(
    out,
    coarseHeight(x - e, z) - coarseHeight(x + e, z),
    2 * e,
    coarseHeight(x, z - e) - coarseHeight(x, z + e),
  );
  return vec3.normalize(out, out);
}

// #endregion

// The GPU gets the coarse shape as two heightfields: a detailed one around the walker,
// and a sparse one reaching all the way to the horizon.
const NEAR = { spacing: 2.5, size: 144, snap: 20 };
const FAR = { spacing: 12, size: 176, snap: 120 };

// Terrain geometry is a set of nested square rings, each twice as coarse as the last.
export const LEVELS = 5;
export const RING_CELLS = 128;
const BASE_SPACING = 0.75;
const RING_VERTS = RING_CELLS + 1;
// Where, relative to its half-size, a ring starts and finishes morphing into its parent.
const MORPH_START = 0.7;
const MORPH_END = 0.85;
// A ring hides the part of itself that the finer ring inside already covers.
const CORE = 0.88;

export const TerrainPoint = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
});

const TerrainParams = d.struct({
  nearOrigin: d.vec2f,
  farOrigin: d.vec2f,
  focus: d.vec2f,
  levelCenters: d.arrayOf(d.vec4f, LEVELS),
});

const catmullRom = (p: d.v4f, t: number) => {
  'use gpu';
  const a = 2 * p.x - 5 * p.y + 4 * p.z - p.w;
  const b = 3 * p.y - p.x - 3 * p.z + p.w;
  const c = p.z - p.x;
  // (value, derivative)
  return d.vec2f(0.5 * (2 * p.y + (c + (a + b * t) * t) * t), 0.5 * (c + (2 * a + 3 * b * t) * t));
};

export function createTerrain(root: TgpuRoot) {
  const params = root.createUniform(TerrainParams);
  const nearGrid = root.createReadonly(d.arrayOf(d.f32, NEAR.size * NEAR.size));
  const farGrid = root.createReadonly(d.arrayOf(d.f32, FAR.size * FAR.size));

  // #region GPU: sampling the heightfields

  /** Returns (height, dh/dx, dh/dz) from a Catmull-Rom interpolated heightfield. */
  function gridSampler(
    grid: typeof nearGrid,
    { size, spacing }: { size: number; spacing: number },
    origin: () => d.v2f,
  ) {
    const at = (x: number, y: number) => {
      'use gpu';
      return grid.$[std.clamp(y, 0, size - 1) * size + std.clamp(x, 0, size - 1)];
    };
    const row = (x: number, y: number, t: number) => {
      'use gpu';
      return catmullRom(d.vec4f(at(x - 1, y), at(x, y), at(x + 1, y), at(x + 2, y)), t);
    };
    return (world: d.v2f) => {
      'use gpu';
      const g = (world - origin()) / spacing;
      const cell = std.floor(g);
      const f = g - cell;
      const x = d.i32(cell.x);
      const y = d.i32(cell.y);
      const r0 = row(x, y - 1, f.x);
      const r1 = row(x, y, f.x);
      const r2 = row(x, y + 1, f.x);
      const r3 = row(x, y + 2, f.x);
      const value = catmullRom(d.vec4f(r0.x, r1.x, r2.x, r3.x), f.y);
      const dx = catmullRom(d.vec4f(r0.y, r1.y, r2.y, r3.y), f.y).x;
      return d.vec3f(value.x, dx, value.y) / d.vec3f(1, spacing, spacing);
    };
  }

  const sampleNear = gridSampler(nearGrid, NEAR, () => {
    'use gpu';
    return d.vec2f(params.$.nearOrigin);
  });
  const sampleFar = gridSampler(farGrid, FAR, () => {
    'use gpu';
    return d.vec2f(params.$.farOrigin);
  });

  const coarse = (world: d.v2f) => {
    'use gpu';
    const far = sampleFar(world);
    const half = ((NEAR.size - 5) * NEAR.spacing) / 2;
    const local = std.abs(world - params.$.nearOrigin - NEAR.spacing * 2 - half) / half;
    const nearWeight = 1 - std.smoothstep(0.8, 0.97, std.max(local.x, local.y));
    let result = d.vec3f(far);
    if (nearWeight > 0) {
      result = std.mix(far, sampleNear(world), nearWeight);
    }
    return result;
  };

  /**
   * Granular detail from `@typegpu/noise`. It is small enough for the walker to ignore,
   * and fades out with distance, where it would only shimmer.
   */
  const detail = (world: d.v2f) => {
    'use gpu';
    const fade = 1 - std.smoothstep(35, 80, std.distance(world, params.$.focus));
    const fine = gpuPerlin.sampleWithGradient(world * 0.45);
    const broad = gpuPerlin.sampleWithGradient(world * 0.21 + d.vec2f(13.7, -4.1));
    const value = fine.x * 0.08 + broad.x * 0.14;
    const gradient = fine.yz * (0.08 * 0.45) + broad.yz * (0.14 * 0.21);
    return d.vec3f(value, gradient) * fade;
  };

  /** Terrain height and its gradient at a point, as (height, dh/dx, dh/dz). */
  const terrainSample = (world: d.v2f) => {
    'use gpu';
    return coarse(world) + detail(world);
  };

  /**
   * The world-space vertex `index` of LOD ring `level`. Near its outer edge, a ring bends into
   * the shape of the next, coarser ring, so the two meet without cracks.
   */
  const ringVertex = (index: number, level: number) => {
    'use gpu';
    const spacing = BASE_SPACING * std.exp2(d.f32(level));
    const cell = d.vec2f(d.f32(index % RING_VERTS), d.f32(index / RING_VERTS)) - RING_CELLS / 2;
    const local = cell * spacing;
    const world = params.$.levelCenters[level].xy + local;
    const edge = std.max(std.abs(cell.x), std.abs(cell.y)) / (RING_CELLS / 2);
    const morph = std.saturate((edge - MORPH_START) / (MORPH_END - MORPH_START));

    let sample = terrainSample(world);
    if (morph > 0) {
      // Vertices that do not exist in the coarser ring slide onto the line between neighbours
      // that do. The "/" diagonal matches how grid cells are split into triangles.
      const odd = std.fract(std.round(world / spacing) * 0.5) * 2;
      let a = d.vec2f(world);
      let b = d.vec2f(world);
      if (odd.x > 0.5 && odd.y > 0.5) {
        a = world + d.vec2f(-spacing, spacing);
        b = world + d.vec2f(spacing, -spacing);
      } else if (odd.x > 0.5) {
        a = world - d.vec2f(spacing, 0);
        b = world + d.vec2f(spacing, 0);
      } else if (odd.y > 0.5) {
        a = world - d.vec2f(0, spacing);
        b = world + d.vec2f(0, spacing);
      }
      sample = std.mix(sample, (terrainSample(a) + terrainSample(b)) * 0.5, morph);
    }

    return TerrainPoint({
      position: d.vec3f(world.x, sample.x, world.y),
      normal: std.normalize(d.vec3f(-sample.y, 1, -sample.z)),
    });
  };

  /** True where a finer ring already draws the terrain. */
  const coveredByInnerRing = (world: d.v2f, level: number) => {
    'use gpu';
    if (level === 0) {
      return false;
    }
    const inner = level - 1;
    const extent = (RING_CELLS / 2) * BASE_SPACING * std.exp2(d.f32(inner));
    const local = std.abs(world - params.$.levelCenters[inner].xy) / extent;
    return std.max(local.x, local.y) < CORE;
  };

  // #endregion

  // #region CPU side

  const indices = new Uint32Array(RING_CELLS * RING_CELLS * 6);
  for (let z = 0, i = 0; z < RING_CELLS; z++) {
    for (let x = 0; x < RING_CELLS; x++) {
      const a = z * RING_VERTS + x;
      indices.set([a, a + RING_VERTS, a + 1, a + 1, a + RING_VERTS, a + RING_VERTS + 1], i);
      i += 6;
    }
  }
  const indexBuffer = root.createBuffer(d.arrayOf(d.u32, indices.length), indices).$usage('index');

  const snapped = { near: '', far: '' };
  const origins = { near: [0, 0], far: [0, 0] };

  function refreshGrid(
    which: 'near' | 'far',
    grid: typeof nearGrid,
    { size, spacing, snap }: typeof NEAR,
    x: number,
    z: number,
  ) {
    const cx = Math.round(x / snap) * snap;
    const cz = Math.round(z / snap) * snap;
    const key = `${cx},${cz}`;
    if (snapped[which] === key) {
      return;
    }
    snapped[which] = key;
    const originX = cx - ((size - 1) * spacing) / 2;
    const originZ = cz - ((size - 1) * spacing) / 2;
    const heights = new Float32Array(size * size);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        heights[j * size + i] = coarseHeight(originX + i * spacing, originZ + j * spacing);
      }
    }
    grid.write(heights);
    origins[which] = [originX, originZ];
  }

  const levelCenters = Array.from({ length: LEVELS }, () => [0, 0, 0, 0]);

  /** Re-centers the rings and heightfields around `focus`. */
  function follow(x: number, z: number) {
    refreshGrid('near', nearGrid, NEAR, x, z);
    refreshGrid('far', farGrid, FAR, x, z);
    for (let level = 0; level < LEVELS; level++) {
      // Snapping to twice the ring spacing keeps vertices in place, and lines them up
      // with every other vertex of the parent ring.
      const snap = 2 * BASE_SPACING * 2 ** level;
      levelCenters[level][0] = Math.round(x / snap) * snap;
      levelCenters[level][1] = Math.round(z / snap) * snap;
    }
    params.write({
      nearOrigin: origins.near as [number, number],
      farOrigin: origins.far as [number, number],
      focus: [x, z],
      levelCenters: levelCenters as [number, number, number, number][],
    });
  }

  // #endregion

  return {
    indexBuffer,
    indexCount: indices.length,
    follow,
    heightAt: coarseHeight,
    normalAt: coarseNormal,
    terrainSample,
    ringVertex,
    coveredByInnerRing,
  };
}

export type Terrain = ReturnType<typeof createTerrain>;

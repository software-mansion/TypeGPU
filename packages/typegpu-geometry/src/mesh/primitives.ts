import { d, std } from 'typegpu';
import { concat, transform } from './combinators.ts';
import { type IndexedGeometry, Surface } from './geometry.ts';
import { frame, NX, NY, NZ, TAU, X, Y, Z } from './math.ts';
import { parametric, sampleGrid } from './parametric.ts';

export const surfaces = {
  sphere: (u: number, v: number) => {
    'use gpu';
    const theta = v * Math.PI;
    const phi = u * TAU;
    const sinTheta = std.sin(theta);

    return d.vec3f(sinTheta * std.cos(phi), std.cos(theta), sinTheta * std.sin(phi));
  },
  plane: (u: number, v: number) => {
    'use gpu';
    return d.vec3f(u - 0.5, 0, 0.5 - v);
  },
  disc: (u: number, v: number) => {
    'use gpu';
    const phi = u * TAU;
    return d.vec3f(v * std.cos(phi), 0, v * std.sin(phi));
  },
  cylinder: (u: number, v: number) => {
    'use gpu';
    const phi = u * TAU;
    return d.vec3f(std.cos(phi), 0.5 - v, std.sin(phi));
  },
  torus: (u: number, v: number, radius: number, tube: number) => {
    'use gpu';
    const phi = u * TAU;
    const t = v * TAU;
    const ring = radius + tube * std.cos(t);

    return d.vec3f(ring * std.cos(phi), -tube * std.sin(t), ring * std.sin(phi));
  },
};

export interface SphereOptions {
  radius?: number;
  segments?: number;
  rings?: number;
}

export function sphere({
  radius = 0.5,
  segments = 32,
  rings = 16,
}: SphereOptions = {}): IndexedGeometry {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error('sphere needs a positive finite radius');
  }
  if (segments < 3 || rings < 2) {
    throw new Error('sphere needs at least 3 segments and 2 rings');
  }
  const grid = sampleGrid(
    (u, v) => {
      'use gpu';
      const normal = surfaces.sphere(u, v);
      return Surface({ position: normal * radius, normal, uv: d.vec2f(u, v) });
    },
    { cols: segments, rows: rings },
  );
  const fan = segments * 3;

  return {
    ...grid,
    indexCount: 6 * segments * (rings - 1),
    indexAt: (i: number) => {
      'use gpu';
      if (i < fan) return grid.indexAt(std.intdiv(i, 3) * 6 + (i % 3) + 3);
      if (i >= grid.indexCount - 3 * fan) {
        const last = i - (grid.indexCount - 3 * fan);
        return grid.indexAt((rings - 1) * segments * 6 + std.intdiv(last, 3) * 6 + (last % 3));
      }
      return grid.indexAt(i + fan);
    },
  };
}

export interface PlaneOptions {
  width?: number;
  depth?: number;
  widthSegments?: number;
  depthSegments?: number;
}

export function plane({
  width = 1,
  depth = 1,
  widthSegments = 1,
  depthSegments = 1,
}: PlaneOptions = {}): IndexedGeometry {
  if (![width, depth].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('plane needs positive finite dimensions');
  }
  return parametric(
    {
      at: (u, v) => {
        'use gpu';
        return surfaces.plane(u, v) * d.vec3f(width, 1, depth);
      },
      normalAt: () => {
        'use gpu';
        return d.vec3f(0, 1, 0);
      },
    },
    { cols: widthSegments, rows: depthSegments },
  );
}

export interface BoxOptions {
  width?: number;
  height?: number;
  depth?: number;
  widthSegments?: number;
  heightSegments?: number;
  depthSegments?: number;
}

export function box({
  width = 1,
  height = 1,
  depth = 1,
  widthSegments = 1,
  heightSegments = 1,
  depthSegments = 1,
}: BoxOptions = {}): IndexedGeometry {
  const top = plane({ width, depth, widthSegments, depthSegments });
  const front = plane({ width, depth: height, widthSegments, depthSegments: heightSegments });
  const side = plane({
    width: depth,
    depth: height,
    widthSegments: depthSegments,
    depthSegments: heightSegments,
  });

  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;

  return concat(
    transform(top, frame(X, Y, Z, d.vec3f(0, y, 0))),
    transform(top, frame(X, NY, NZ, d.vec3f(0, -y, 0))),
    transform(front, frame(X, Z, NY, d.vec3f(0, 0, z))),
    transform(front, frame(NX, NZ, NY, d.vec3f(0, 0, -z))),
    transform(side, frame(NZ, X, NY, d.vec3f(x, 0, 0))),
    transform(side, frame(Z, NX, NY, d.vec3f(-x, 0, 0))),
  );
}

export interface CylinderOptions {
  radius?: number;
  height?: number;
  radialSegments?: number;
  heightSegments?: number;
  caps?: boolean;
}

export function cylinder({
  radius = 0.5,
  height = 1,
  radialSegments = 32,
  heightSegments = 1,
  caps = true,
}: CylinderOptions = {}): IndexedGeometry {
  if (![radius, height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('cylinder needs positive finite dimensions');
  }
  if (radialSegments < 3) {
    throw new Error('cylinder needs at least 3 radial segments');
  }
  const side = sampleGrid(
    (u, v) => {
      'use gpu';
      const phi = u * TAU;
      const normal = d.vec3f(std.cos(phi), 0, std.sin(phi));
      return Surface({
        position: normal * radius + d.vec3f(0, (0.5 - v) * height, 0),
        normal,
        uv: d.vec2f(u, v),
      });
    },
    { cols: radialSegments, rows: heightSegments },
  );

  if (!caps) {
    return side;
  }

  const cap: IndexedGeometry = {
    schema: Surface,
    topology: 'triangle-list',
    vertexCount: radialSegments + 1,
    indexCount: radialSegments * 3,
    vertexAt: (i: number) => {
      'use gpu';
      let direction = d.vec3f();
      if (i > 0) direction = surfaces.disc((i - 1) / radialSegments, 1);
      return Surface({
        position: direction * radius,
        normal: d.vec3f(0, 1, 0),
        uv: direction.xz * 0.5 + 0.5,
      });
    },
    indexAt: (i: number) => {
      'use gpu';
      const triangle = std.intdiv(i, 3);
      if (i % 3 === 0) return 0;
      if (i % 3 === 1) return ((triangle + 1) % radialSegments) + 1;
      return triangle + 1;
    },
  };

  return concat(
    side,
    transform(cap, frame(X, Y, Z, d.vec3f(0, height / 2, 0))),
    transform(cap, frame(X, NY, NZ, d.vec3f(0, -height / 2, 0))),
  );
}

export interface TorusOptions {
  radius?: number;
  tube?: number;
  ringSegments?: number;
  tubeSegments?: number;
}

export function torus({
  radius = 0.35,
  tube = 0.15,
  ringSegments = 48,
  tubeSegments = 24,
}: TorusOptions = {}): IndexedGeometry {
  if (![radius, tube].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('torus needs positive finite radii');
  }
  if (ringSegments < 3 || tubeSegments < 3) {
    throw new Error('torus needs at least 3 ring and tube segments');
  }
  return sampleGrid(
    (u, v) => {
      'use gpu';
      const phi = u * TAU;
      const t = v * TAU;
      const radial = d.vec3f(std.cos(phi), 0, std.sin(phi));
      const normal = radial * std.cos(t) - d.vec3f(0, std.sin(t), 0);
      return Surface({
        position: radial * radius + normal * tube,
        normal,
        uv: d.vec2f(u, v),
      });
    },
    { cols: ringSegments, rows: tubeSegments },
  );
}

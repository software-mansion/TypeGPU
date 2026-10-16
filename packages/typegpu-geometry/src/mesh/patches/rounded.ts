import { d, std, tgpu } from 'typegpu';
import { Surface } from '../geometry.ts';
import { X, Y, Z } from '../math.ts';
import { type PatchSurface } from '../triangles.ts';
import { arc, uniformArea } from './spherical.ts';

const axes = tgpu.const(d.arrayOf(d.vec3f, 3), [X, Y, Z]);

function bitSigns(bits: number) {
  'use gpu';
  return d.vec3f(
    std.select(1, -1, (bits & 1) !== 0),
    std.select(1, -1, (bits & 2) !== 0),
    std.select(1, -1, (bits & 4) !== 0),
  );
}

function cornerNormal(octant: number, weights: d.v3f) {
  'use gpu';
  const signs = bitSigns(octant);
  const w = std.select(weights.xzy, weights, signs.x * signs.y * signs.z > 0);
  return uniformArea(d.vec3f(signs.x, 0, 0), d.vec3f(0, signs.y, 0), d.vec3f(0, 0, signs.z), w);
}

function quadCoordinates(triangle: number, weights: d.v3f) {
  'use gpu';
  return std.select(
    d.vec2f(weights.y, weights.y + weights.z),
    d.vec2f(weights.y + weights.z, weights.z),
    triangle === 0,
  );
}

const edgeSurface = tgpu.fn(
  [d.u32, d.vec3f, d.vec3f, d.vec3f, d.vec3f, d.vec3f, d.f32, d.f32],
  Surface,
)((triangle, weights, center, axis, u, v, halfHeight, radius) => {
  'use gpu';
  const w = std.select(weights.xzy, weights, std.dot(std.cross(v, axis), u) > 0);
  const uv = quadCoordinates(triangle, w);
  const normal = arc(u, v, uv.x);
  return Surface({
    position: center + axis * ((2 * uv.y - 1) * halfHeight) + normal * radius,
    normal,
    uv,
  });
});

export interface CapsuleOptions {
  radius?: number;
  /** Length of the cylindrical section */
  height?: number;
}

/** Cap UVs are patch-local, side UVs span each quarter cylinder */
export function capsule({ radius = 0.25, height = 0.5 }: CapsuleOptions = {}): PatchSurface {
  const halfHeight = height / 2;
  return {
    schema: Surface,
    patchCount: height === 0 ? 8 : 16,
    at: (patch: number, w: d.v3f) => {
      'use gpu';
      if (patch < 8) {
        const normal = cornerNormal(patch, w);
        const center = d.vec3f(0, bitSigns(patch).y * halfHeight, 0);
        return Surface({ position: center + normal * radius, normal, uv: w.yz });
      }
      const signs = bitSigns(std.intdiv(patch - 8, 2));
      const u = X * signs.x;
      const v = Z * signs.y;
      return edgeSurface(patch % 2, w, d.vec3f(), Y, u, v, halfHeight, radius);
    },
  };
}

export interface RoundedBoxOptions {
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
}

/** Corner UVs are patch-local, face and edge UVs span their respective quads */
export function roundedBox({
  width = 1,
  height = 1,
  depth = 1,
  radius = 0.1,
}: RoundedBoxOptions = {}): PatchSurface {
  const halfSize = d.vec3f(width / 2, height / 2, depth / 2);
  const inset = halfSize.sub(radius);
  return {
    schema: Surface,
    patchCount: radius === 0 ? 12 : 44,
    at: (index: number, w: d.v3f) => {
      'use gpu';
      const patch = index + (radius === 0 ? 8 : 0);
      if (patch < 8) {
        const normal = cornerNormal(patch, w);
        return Surface({
          position: bitSigns(patch) * inset + normal * radius,
          normal,
          uv: w.yz,
        });
      }
      if (patch < 20) {
        const face = std.intdiv(patch - 8, 2);
        const axisIndex = std.intdiv(face, 2);
        const sign = bitSigns(face).x;
        const normal = (axes.$[axisIndex] as d.v3f) * sign;
        const u = axes.$[(axisIndex + 1) % 3] as d.v3f;
        const v = (axes.$[(axisIndex + 2) % 3] as d.v3f) * sign;
        const uv = quadCoordinates(patch % 2, w);
        const position = normal * halfSize + (u * (2 * uv.x - 1) + v * (2 * uv.y - 1)) * inset;
        return Surface({ position, normal, uv });
      }
      const edge = std.intdiv(patch - 20, 2);
      const axisIndex = std.intdiv(edge, 4);
      const axis = axes.$[axisIndex] as d.v3f;
      const signs = bitSigns(edge);
      const u = (axes.$[(axisIndex + 1) % 3] as d.v3f) * signs.x;
      const v = (axes.$[(axisIndex + 2) % 3] as d.v3f) * signs.y;
      return edgeSurface(patch % 2, w, (u + v) * inset, axis, u, v, std.dot(axis, inset), radius);
    },
  };
}

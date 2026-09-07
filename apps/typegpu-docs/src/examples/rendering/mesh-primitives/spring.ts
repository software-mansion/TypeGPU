import { d, std } from 'typegpu';
import { meshes } from '@typegpu/geometry';
import { sceneLayout } from './shading.ts';

const TAU = Math.PI * 2;
const turns = 4;
const radius = 0.3;
const tube = 0.07;
const height = 1;

const centerAt = (u: number) => {
  'use gpu';
  const phi = u * TAU * turns;
  return d.vec3f(radius * std.cos(phi), (u - 0.5) * height, radius * std.sin(phi));
};

const radialAt = (u: number) => {
  'use gpu';
  const phi = u * TAU * turns;
  return d.vec3f(std.cos(phi), 0, std.sin(phi));
};

const tangentAt = (u: number) => {
  'use gpu';
  const phi = u * TAU * turns;
  return std.normalize(
    d.vec3f(-radius * std.sin(phi) * TAU * turns, height, radius * std.cos(phi) * TAU * turns),
  );
};

const offset = (u: number, v: number) => {
  'use gpu';
  const t = v * TAU;
  const radial = radialAt(u);
  const binormal = std.cross(radial, tangentAt(u));
  return radial * std.cos(t) + binormal * std.sin(t);
};

const body = meshes.parametric(
  {
    at: (u, v) => {
      'use gpu';
      return centerAt(u) + offset(u, v) * tube;
    },
    normalAt: offset,
  },
  { cols: 48 * turns, rows: 12 },
);

const cap = meshes.parametric(
  {
    at: (u, v) => {
      'use gpu';
      return meshes.surfaces.disc(u, v) * tube;
    },
    normalAt: () => {
      'use gpu';
      return d.vec3f(0, 1, 0);
    },
  },
  { cols: 12, rows: 1 },
);

const capAt = (u: number, sign: number) => {
  const radial = radialAt(u);
  const tangent = tangentAt(u).mul(sign);
  const binormal = std.cross(radial, tangent);

  const frame = d.mat4x4f(
    d.vec4f(radial, 0),
    d.vec4f(tangent, 0),
    d.vec4f(binormal, 0),
    d.vec4f(centerAt(u), 1),
  );

  return meshes.transform(cap, frame);
};

export const spring = meshes.map(
  meshes.concat(body, capAt(0, -1), capAt(1, 1)),
  meshes.Surface,
  (vertex) => {
    'use gpu';
    const stretch = 1 + 0.3 * std.sin(sceneLayout.$.uniforms.time * 2);

    return meshes.Surface({
      position: vertex.position * d.vec3f(1, stretch, 1),
      normal: std.normalize(vertex.normal / d.vec3f(1, stretch, 1)),
      uv: vertex.uv,
    });
  },
);

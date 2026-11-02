import { d, tgpu } from 'typegpu';
import { Box, Lights, Sphere } from './schemas.ts';

const floor = { albedo: d.vec3f(0.026, 0.022, 0.026), roughness: 0.1, metallic: 0, wetness: 0.12 };
const backdrop = { albedo: d.vec3f(0.026, 0.019, 0.028), roughness: 0.42, metallic: 0, wetness: 0 };
const plinth = { albedo: d.vec3f(0.052, 0.04, 0.046), roughness: 0.14, metallic: 0, wetness: 0 };
const gold = { albedo: d.vec3f(1, 0.62, 0.18), roughness: 0.18, metallic: 0.55, wetness: 0 };
const ceramic = { albedo: d.vec3f(0.2, 0.17, 0.17), roughness: 0.16, metallic: 0, wetness: 0 };
const plastic = { albedo: d.vec3f(0.045, 0.028, 0.075), roughness: 0.16, metallic: 0, wetness: 0 };

const pedestals = [
  {
    center: d.vec3f(-1.15, 0.095, -1.1),
    halfExtents: d.vec3f(0.88, 0.095, 0.72),
    bevel: 0.13,
    bevelHeight: 0.055,
    radius: 0.72,
    material: gold,
  },
  {
    center: d.vec3f(0.05, 0.08, 0.92),
    halfExtents: d.vec3f(0.44, 0.08, 0.36),
    bevel: 0.08,
    bevelHeight: 0.045,
    radius: 0.38,
    material: ceramic,
  },
  {
    center: d.vec3f(1.45, 0.09, -0.62),
    halfExtents: d.vec3f(0.66, 0.09, 0.52),
    bevel: 0.11,
    bevelHeight: 0.05,
    radius: 0.56,
    material: plastic,
  },
  {
    center: d.vec3f(-2.45, 0.16, 0.85),
    halfExtents: d.vec3f(0.56, 0.16, 0.44),
    bevel: 0.1,
    bevelHeight: 0.055,
    radius: 0.48,
    material: plastic,
  },
];

export const boxes = tgpu.const(d.arrayOf(Box, pedestals.length + 2), [
  {
    center: d.vec3f(0, -0.01, 0),
    halfExtents: d.vec3f(5.8, 0.01, 4.9),
    bevel: 0.005,
    bevelHeight: 0.005,
    material: floor,
  },
  {
    center: d.vec3f(0, 1.3, -3.31),
    halfExtents: d.vec3f(4.2, 1.3, 0.01),
    bevel: 0.005,
    bevelHeight: 0.005,
    material: backdrop,
  },
  ...pedestals.map((p) => ({ ...p, material: plinth })),
]);

export const spheres = tgpu.const(
  d.arrayOf(Sphere, pedestals.length),
  pedestals.map((p) => ({
    center: d.vec3f(p.center.x, p.center.y + p.halfExtents.y + p.radius, p.center.z),
    radius: p.radius,
    material: p.material,
  })),
);

export const initialLights = [
  {
    center: d.vec3f(0, 3.05, -0.55),
    dirX: d.vec3f(1, 0, 0),
    dirY: d.vec3f(0, 0, 1),
    halfSize: d.vec2f(1.25, 0.75),
    color: d.vec3f(1, 0.26, 0.62),
    intensity: 8.2,
  },
  {
    center: d.vec3f(-3.4, 1.6, 1.8),
    dirX: d.vec3f(0, 0, 1),
    dirY: d.vec3f(0, 1, 0),
    halfSize: d.vec2f(0.7, 0.95),
    color: d.vec3f(1, 0.48, 0.16),
    intensity: 4.4,
  },
  {
    center: d.vec3f(3.1, 1.45, -2.5),
    dirX: d.vec3f(1, 0, 0),
    dirY: d.vec3f(0, 1, 0),
    halfSize: d.vec2f(0.55, 0.8),
    color: d.vec3f(0.56, 0.24, 1),
    intensity: 2.6,
  },
] satisfies d.InferInput<typeof Lights>;

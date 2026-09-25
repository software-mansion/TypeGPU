import { sdBox2d, sdDisk } from '@typegpu/sdf';
import { d, std, tgpu } from 'typegpu';

export const sceneSize = 512;

export const Surface = d.struct({
  distance: d.f32,
  albedo: d.vec3f,
});

const grey = d.vec3f(0.72);
const blue = d.vec3f(0.035, 0.2, 0.82);
const green = d.vec3f(0.025, 0.75, 0.38);
const red = d.vec3f(0.82, 0.065, 0.025);
const orange = d.vec3f(0.85, 0.4, 0.025);

function box(center: d.v2f, halfSize: d.v2f, albedo: d.v3f, angle = 0) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return (p: d.v2f) => {
    'use gpu';
    const q = p - center;
    const local = d.vec2f(q.x * c + q.y * s, q.y * c - q.x * s);
    return Surface({ distance: sdBox2d(local, halfSize) - 3, albedo });
  };
}

function disk(center: d.v2f, radius: number, albedo: d.v3f) {
  return (p: d.v2f) => {
    'use gpu';
    return Surface({ distance: sdDisk(p - center, radius), albedo });
  };
}

const shapes = [
  box(d.vec2f(250, 118), d.vec2f(5, 84), grey),
  box(d.vec2f(351, 280), d.vec2f(99, 5), blue),
  box(d.vec2f(310, 361), d.vec2f(5, 49), grey),
  box(d.vec2f(370, 310), d.vec2f(65, 5), grey),
  box(d.vec2f(391, 193), d.vec2f(58, 5), grey),
  box(d.vec2f(459, 110), d.vec2f(4, 55), blue),
  box(d.vec2f(459, 392), d.vec2f(4, 49), green),
  box(d.vec2f(176, 168), d.vec2f(17, 37), red, -0.28),
  box(d.vec2f(194, 379), d.vec2f(6, 48), green, 0.3),
  disk(d.vec2f(106, 331), 31, orange),
  disk(d.vec2f(385, 414), 17, grey),
  disk(d.vec2f(342, 99), 23, grey),
];

export const scene = (p: d.v2f) => {
  'use gpu';
  const surface = Surface({ distance: 12 - sdBox2d(p - 256, d.vec2f(216)), albedo: grey });

  for (const shape of tgpu.unroll(shapes)) {
    const candidate = shape(p);
    if (candidate.distance < surface.distance) {
      surface.distance = candidate.distance;
      surface.albedo = d.vec3f(candidate.albedo);
    }
  }

  return surface;
};

export const normalAt = (p: d.v2f, radius: number) => {
  'use gpu';
  const dx = d.vec2f(radius, 0);
  const dy = d.vec2f(0, radius);

  const gradient = d.vec2f(
    scene(p + dx).distance - scene(p - dx).distance,
    scene(p + dy).distance - scene(p - dy).distance,
  );
  return gradient / std.max(std.length(gradient), 0.00001);
};

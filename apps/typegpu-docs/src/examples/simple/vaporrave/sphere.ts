import { perlin3d } from '@typegpu/noise';
import { sdSphere } from '@typegpu/sdf';
import tgpu, { d, std } from 'typegpu';

import * as c from './constants.ts';
import { Ray } from './types.ts';

/**
 * Returns a transformation matrix that represents an `angle` rotation
 * in XY plane (around the Z axis)
 */
const rotateAroundZ = tgpu.fn(
  [d.f32],
  d.mat3x3f,
)((angle) =>
  d.mat3x3f(
    d.vec3f(std.cos(angle), std.sin(angle), 0),
    d.vec3f(-std.sin(angle), std.cos(angle), 0),
    d.vec3f(0, 0, 1),
  ),
);

/**
 * Returns a transformation matrix that represents an `angle` rotation
 * in YZ plane (around the X axis)
 */
const rotateAroundX = tgpu.fn(
  [d.f32],
  d.mat3x3f,
)((angle) =>
  d.mat3x3f(
    d.vec3f(1, 0, 0),
    d.vec3f(0, std.cos(angle), std.sin(angle)),
    d.vec3f(0, -std.sin(angle), std.cos(angle)),
  ),
);

export const getSphere = tgpu.fn(
  [d.vec3f, d.vec3f, d.vec3f, d.f32],
  Ray,
)((p, sphereColor, sphereCenter, angle) => {
  'use gpu';
  const localP = p - sphereCenter; // (0,0) is the center to rotate easily
  const rotMatZ = rotateAroundZ(-angle * 0.3);
  const rotMatX = rotateAroundX(-angle * 0.7);
  const rotatedP = localP * rotMatZ * rotMatX;

  // breathing effect
  const radius = d.f32(c.SPHERE_RADIUS) + std.sin(angle);

  const rawDist = sdSphere(rotatedP, radius);
  let noise = d.f32(0);
  if (rawDist < d.f32(1)) {
    noise += perlin3d.sample(rotatedP + angle);
  }

  return {
    dist: rawDist + noise,
    color: sphereColor,
  };
});

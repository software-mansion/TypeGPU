import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { perlin3d } from '@typegpu/noise';
import { sdSphere } from '@typegpu/sdf';

import { Ray } from './types.ts';
import * as c from './constants.ts';

export const getSphere = tgpu.fn(
  [d.vec3f, d.vec3f, d.vec3f, d.f32],
  Ray,
)((p, sphereColor, sphereCenter, angle) => {
  const localP = std.sub(p, sphereCenter); // (0,0) is the center to rotate easily
  const rotMatZ = d.mat4x4f.rotationZ(-angle * 0.3);
  const rotMatX = d.mat4x4f.rotationX(-angle * 0.7);
  const rotatedP = std.mul(rotMatZ, std.mul(rotMatX, d.vec4f(localP, 1))).xyz;

  // breathing effect
  const radius = d.f32(c.sphereRadius) + std.sin(angle);

  const noise = perlin3d.sample(std.add(rotatedP, angle));

  return {
    dist: sdSphere(rotatedP, radius) + noise,
    color: sphereColor,
  };
});

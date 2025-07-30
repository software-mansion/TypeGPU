import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { perlin3d } from '@typegpu/noise';
import { sdSphere } from '@typegpu/sdf';

import { Ray } from './types.ts';

export const getSphere = tgpu.fn(
  [d.vec3f, d.vec3f, d.vec3f, d.f32],
  Ray,
)((p, sphereColor, sphereCenter, time) => {
  const localP = std.sub(p, sphereCenter); // (0,0) is the center to rotate easily
  const rotMatZ = d.mat4x4f.rotationZ(-time * 0.3);
  const rotMatX = d.mat4x4f.rotationX(-time * 0.7);
  const rotatedP = std.mul(rotMatZ, std.mul(rotMatX, d.vec4f(localP, 1))).xyz;

  // breathing effect
  const radius = 3 + std.sin(time);

  const noise = perlin3d.sample(std.add(rotatedP, time));

  return {
    dist: sdSphere(rotatedP, radius) + noise,
    color: sphereColor,
  };
});

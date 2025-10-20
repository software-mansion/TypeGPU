import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { BoxIntersection } from './dataTypes.ts';
import type { TgpuRoot } from 'typegpu';

export const fresnelSchlick = (
  cosTheta: number,
  ior1: number,
  ior2: number,
) => {
  'use gpu';
  const r0 = std.pow((ior1 - ior2) / (ior1 + ior2), 2.0);
  return r0 + (1.0 - r0) * std.pow(1.0 - cosTheta, 5.0);
};

export const beerLambert = (sigma: d.v3f, dist: number) => {
  'use gpu';
  return std.exp(std.mul(sigma, -dist));
};

export const intersectBox = (
  rayOrigin: d.v3f,
  rayDirection: d.v3f,
  boxMin: d.v3f,
  boxMax: d.v3f,
) => {
  'use gpu';
  const invDir = d.vec3f(1.0).div(rayDirection);

  const t1 = std.sub(boxMin, rayOrigin).mul(invDir);
  const t2 = std.sub(boxMax, rayOrigin).mul(invDir);

  const tMinVec = std.min(t1, t2);
  const tMaxVec = std.max(t1, t2);

  const tMin = std.max(std.max(tMinVec.x, tMinVec.y), tMinVec.z);
  const tMax = std.min(std.min(tMaxVec.x, tMaxVec.y), tMaxVec.z);

  const result = BoxIntersection();
  result.hit = tMax >= tMin && tMax >= 0.0;
  result.tMin = tMin;
  result.tMax = tMax;

  return result;
};

export function createTextures(root: TgpuRoot, width: number, height: number) {
  return [0, 1].map(() => {
    const texture = root['~unstable'].createTexture({
      size: [width, height],
      format: 'rgba8unorm',
    }).$usage('storage', 'sampled', 'render');

    return {
      write: texture.createView(d.textureStorage2d('rgba8unorm')),
      sampled: texture.createView(),
    };
  });
}

export function createBackgroundDistTexture(
  root: TgpuRoot,
  width: number,
  height: number,
) {
  const texture = root['~unstable'].createTexture({
    size: [width, height],
    format: 'r32float',
  }).$usage('storage');

  return {
    write: texture.createView(d.textureStorage2d('r32float')),
    read: texture.createView(d.textureStorage2d('r32float', 'read-only')),
  };
}

export const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const uv = [d.vec2f(0, 1), d.vec2f(2, 1), d.vec2f(0, -1)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0, 1),
    uv: uv[input.vertexIndex],
  };
});

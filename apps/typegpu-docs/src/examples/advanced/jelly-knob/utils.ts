import { d, std, type TgpuRoot } from 'typegpu';
import { type BoundingBox, BoxIntersection } from './dataTypes.ts';

export function fresnelSchlick(cosTheta: number, ior1: number, ior2: number) {
  'use gpu';
  const r0 = std.pow((ior1 - ior2) / (ior1 + ior2), 2.0);
  return r0 + (1.0 - r0) * std.pow(1.0 - cosTheta, 5.0);
}

export function beerLambert(sigma: d.v3f, dist: number) {
  'use gpu';
  return std.exp(sigma * -dist);
}

export function intersectBox(rayOrigin: d.v3f, rayDirection: d.v3f, box: BoundingBox) {
  'use gpu';
  const invDir = d.vec3f(1.0) / rayDirection;

  const t1 = (box.min - rayOrigin) * invDir;
  const t2 = (box.max - rayOrigin) * invDir;

  const tMinVec = std.min(t1, t2);
  const tMaxVec = std.max(t1, t2);

  const tMin = std.max(std.max(tMinVec.x, tMinVec.y), tMinVec.z);
  const tMax = std.min(std.min(tMaxVec.x, tMaxVec.y), tMaxVec.z);

  const result = BoxIntersection();
  result.hit = tMax >= tMin && tMax >= 0.0;
  result.tMin = tMin;
  result.tMax = tMax;

  return result;
}

/**
 * Source: https://mini.gmshaders.com/p/3d-rotation
 */
export function rotateY(p: d.v3f, angle: number) {
  'use gpu';
  return (
    std.mix(d.vec3f(0, p.y, 0), p, std.cos(angle)) + std.cross(p, d.vec3f(0, 1, 0)) * std.sin(angle)
  );
}

export function createTextures(root: TgpuRoot, width: number, height: number) {
  return [0, 1].map(() => {
    const texture = root
      .createTexture({
        size: [width, height],
        format: 'rgba16float',
      })
      .$usage('sampled', 'render');

    return {
      texture,
      sampled: texture.createView(),
    };
  });
}

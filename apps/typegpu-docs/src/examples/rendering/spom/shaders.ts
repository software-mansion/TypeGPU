import { d, std } from 'typegpu';

// PBR

export function distributionGGX(NdotH: number, roughness: number) {
  'use gpu';
  const a = roughness * roughness;
  const a2 = a * a;
  const denom = NdotH * NdotH * (a2 - 1) + 1;
  return a2 / (Math.PI * denom * denom);
}

export function geometrySchlickGGX(NdotV: number, roughness: number) {
  'use gpu';
  const r = roughness + 1;
  const k = (r * r) / 8;
  return NdotV / (NdotV * (1 - k) + k);
}

export function geometrySmith(NdotV: number, NdotL: number, roughness: number) {
  'use gpu';
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

export function fresnelSchlick(cosTheta: number, F0: d.v3f) {
  'use gpu';
  const f = std.pow(1 - cosTheta, 5);
  return F0.add(std.sub(1, F0).mul(f));
}

// SPOM

export function isOutOfBounds(uv: d.v2f, tiling: number) {
  'use gpu';
  return uv.x < 0 || uv.x > tiling || uv.y < 0 || uv.y > tiling;
}

export function toTangentSpace(dir: d.v3f, T: d.v3f, B: d.v3f, N: d.v3f) {
  'use gpu';
  return std.normalize(d.vec3f(std.dot(dir, T), std.dot(dir, B), std.dot(dir, N)));
}

export function uvRayPerDepth(dir: d.v3f, heightScale: number, tiling: number, size: d.v2f) {
  'use gpu';
  const invZ = 1 / std.max(dir.z, 0.001);
  return dir.xy.mul(invZ).mul(heightScale).mul(tiling).div(size);
}

export function faceEdgeMask(uv01: d.v2f) {
  'use gpu';

  const edge = std.min(std.min(uv01.x, 1 - uv01.x), std.min(uv01.y, 1 - uv01.y));
  return std.smoothstep(0.055, 0.14, edge);
}

export function shapeSurfaceDepth(rawDepth: number, materialBase: number, uv01: d.v2f) {
  'use gpu';

  if (materialBase === 0) {
    return std.mix(0.58, rawDepth, 0.42);
  }

  const height = 1 - rawDepth;
  return 1 - height * faceEdgeMask(uv01);
}

export function intersectUvDepthBox(
  startUv: d.v2f,
  rayUvPerDepth: d.v2f,
  tiling: number,
  maxDepthDelta: number,
) {
  'use gpu';

  let tMin = d.f32(0);
  let tMax = maxDepthDelta;
  const eps = d.f32(0.00001);

  if (std.abs(rayUvPerDepth.x) < eps) {
    if (startUv.x < 0 || startUv.x > tiling) {
      return d.vec2f(1, 0);
    }
  } else {
    const tx0 = (0 - startUv.x) / rayUvPerDepth.x;
    const tx1 = (tiling - startUv.x) / rayUvPerDepth.x;
    tMin = std.max(tMin, std.min(tx0, tx1));
    tMax = std.min(tMax, std.max(tx0, tx1));
  }

  if (std.abs(rayUvPerDepth.y) < eps) {
    if (startUv.y < 0 || startUv.y > tiling) {
      return d.vec2f(1, 0);
    }
  } else {
    const ty0 = (0 - startUv.y) / rayUvPerDepth.y;
    const ty1 = (tiling - startUv.y) / rayUvPerDepth.y;
    tMin = std.max(tMin, std.min(ty0, ty1));
    tMax = std.min(tMax, std.max(ty0, ty1));
  }

  return d.vec2f(tMin, tMax);
}

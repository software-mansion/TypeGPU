import tgpu, { d, std } from 'typegpu';
import { ltcFiltering } from './ltcConfig.ts';
import { ltcLayout, RectLight } from './schemas.ts';

const ltcFilteringEnabled = tgpu.comptime(ltcFiltering);

const LUT_SIZE = 64;
const LUT_SCALE = (LUT_SIZE - 1) / LUT_SIZE;
const LUT_BIAS = 0.5 / LUT_SIZE;

const HorizonClip = d.struct({
  l0: d.vec3f,
  l1: d.vec3f,
  l2: d.vec3f,
  l3: d.vec3f,
  l4: d.vec3f,
  count: d.u32,
});

export function ltcUv(roughness: number, NdotV: number) {
  'use gpu';
  return d.vec2f(roughness, std.sqrt(1 - NdotV)) * LUT_SCALE + LUT_BIAS;
}

function bilinearLut(texture: d.texture2d<d.F32>, uv: d.v2f) {
  'use gpu';
  const pos = std.clamp(uv * LUT_SIZE - 0.5, d.vec2f(0), d.vec2f(LUT_SIZE - 1));
  const base = std.floor(pos);
  const frac = pos - base;
  const next = std.min(base + 1, d.vec2f(LUT_SIZE - 1));

  const t00 = std.textureLoad(texture, d.vec2u(base.x, base.y), 0);
  const t10 = std.textureLoad(texture, d.vec2u(next.x, base.y), 0);
  const t01 = std.textureLoad(texture, d.vec2u(base.x, next.y), 0);
  const t11 = std.textureLoad(texture, d.vec2u(next.x, next.y), 0);

  return std.mix(std.mix(t00, t10, frac.x), std.mix(t01, t11, frac.x), frac.y);
}

function sampleLtcTexture(texture: d.texture2d<d.F32>, uv: d.v2f) {
  'use gpu';
  if (ltcFilteringEnabled()) {
    return std.textureSampleLevel(texture, ltcLayout.$.ltcSampler, uv, 0);
  } else {
    return bilinearLut(texture, uv);
  }
}

export function sampleLtcMatrix(uv: d.v2f) {
  'use gpu';
  const t = sampleLtcTexture(ltcLayout.$.ltcMat, uv);
  return d.mat3x3f(d.vec3f(t.x, 0, t.y), d.vec3f(0, 1, 0), d.vec3f(t.z, 0, t.w));
}

export function sampleLtcAmplitude(uv: d.v2f) {
  'use gpu';
  return sampleLtcTexture(ltcLayout.$.ltcAmp, uv);
}

function integrateEdge(from: d.v3f, to: d.v3f) {
  'use gpu';
  const cosAngle = std.dot(from, to);
  const absCos = std.abs(cosAngle);
  const numer = 0.8543985 + (0.4965155 + 0.0145206 * absCos) * absCos;
  const denom = 3.417594 + (4.1616724 + absCos) * absCos;
  const approx = numer / denom;
  const thetaSinTheta = std.select(
    0.5 * std.inverseSqrt(std.max(1 - cosAngle * cosAngle, 1e-7)) - approx,
    approx,
    cosAngle > 0,
  );
  return (std.cross(from, to) * thetaSinTheta).z;
}

function clipQuadToHorizon(p0: d.v3f, p1: d.v3f, p2: d.v3f, p3: d.v3f) {
  'use gpu';
  let l0 = d.vec3f(p0);
  let l1 = d.vec3f(p1);
  let l2 = d.vec3f(p2);
  let l3 = d.vec3f(p3);
  let l4 = d.vec3f(p0);

  let config = d.i32(0);
  if (l0.z > 0) {
    config += 1;
  }
  if (l1.z > 0) {
    config += 2;
  }
  if (l2.z > 0) {
    config += 4;
  }
  if (l3.z > 0) {
    config += 8;
  }

  let count = d.u32(0);

  if (config === 1) {
    count = d.u32(3);
    l1 = -l1.z * l0 + l0.z * l1;
    l2 = -l3.z * l0 + l0.z * l3;
  } else if (config === 2) {
    count = d.u32(3);
    l0 = -l0.z * l1 + l1.z * l0;
    l2 = -l2.z * l1 + l1.z * l2;
  } else if (config === 3) {
    count = d.u32(4);
    l2 = -l2.z * l1 + l1.z * l2;
    l3 = -l3.z * l0 + l0.z * l3;
  } else if (config === 4) {
    count = d.u32(3);
    l0 = -l3.z * l2 + l2.z * l3;
    l1 = -l1.z * l2 + l2.z * l1;
  } else if (config === 6) {
    count = d.u32(4);
    l0 = -l0.z * l1 + l1.z * l0;
    l3 = -l3.z * l2 + l2.z * l3;
  } else if (config === 7) {
    count = d.u32(5);
    l4 = -l3.z * l0 + l0.z * l3;
    l3 = -l3.z * l2 + l2.z * l3;
  } else if (config === 8) {
    count = d.u32(3);
    l0 = -l0.z * l3 + l3.z * l0;
    l1 = -l2.z * l3 + l3.z * l2;
    l2 = d.vec3f(l3);
  } else if (config === 9) {
    count = d.u32(4);
    l1 = -l1.z * l0 + l0.z * l1;
    l2 = -l2.z * l3 + l3.z * l2;
  } else if (config === 11) {
    count = d.u32(5);
    l4 = d.vec3f(l3);
    l3 = -l2.z * l3 + l3.z * l2;
    l2 = -l2.z * l1 + l1.z * l2;
  } else if (config === 12) {
    count = d.u32(4);
    l1 = -l1.z * l2 + l2.z * l1;
    l0 = -l0.z * l3 + l3.z * l0;
  } else if (config === 13) {
    count = d.u32(5);
    l4 = d.vec3f(l3);
    l3 = d.vec3f(l2);
    l2 = -l1.z * l2 + l2.z * l1;
    l1 = -l1.z * l0 + l0.z * l1;
  } else if (config === 14) {
    count = d.u32(5);
    l4 = -l0.z * l3 + l3.z * l0;
    l0 = -l0.z * l1 + l1.z * l0;
  } else if (config === 15) {
    count = d.u32(4);
  }

  if (count === d.u32(3)) {
    l3 = d.vec3f(l0);
  }
  if (count === d.u32(4)) {
    l4 = d.vec3f(l0);
  }

  return HorizonClip({ l0, l1, l2, l3, l4, count });
}

export function evaluateTwoSidedLtcRectFormFactor(
  normal: d.v3f,
  viewDir: d.v3f,
  worldPos: d.v3f,
  ltcInverseTransform: d.m3x3f,
  light: d.Infer<typeof RectLight>,
) {
  'use gpu';
  let tangent = viewDir - normal * std.dot(viewDir, normal);
  if (std.dot(tangent, tangent) < 1e-5) {
    let up = d.vec3f(0, 0, 1);
    if (std.abs(normal.z) > 0.999) {
      up = d.vec3f(0, 1, 0);
    }
    tangent = std.cross(up, normal);
  }
  tangent = std.normalize(tangent);
  const bitangent = std.cross(normal, tangent);

  const edgeU = light.dirX * light.halfSize.x;
  const edgeV = light.dirY * light.halfSize.y;
  const corner0 = light.center - edgeU - edgeV;
  const corner1 = light.center + edgeU - edgeV;
  const corner2 = light.center + edgeU + edgeV;
  const corner3 = light.center - edgeU + edgeV;

  const tangentBasis = std.transpose(d.mat3x3f(tangent, bitangent, normal));
  const worldToLtc = ltcInverseTransform * tangentBasis;

  const clipped = clipQuadToHorizon(
    worldToLtc * (corner0 - worldPos),
    worldToLtc * (corner1 - worldPos),
    worldToLtc * (corner2 - worldPos),
    worldToLtc * (corner3 - worldPos),
  );

  if (clipped.count === d.u32(0)) {
    return d.f32(0);
  }

  const l0 = std.normalize(clipped.l0);
  const l1 = std.normalize(clipped.l1);
  const l2 = std.normalize(clipped.l2);
  const l3 = std.normalize(clipped.l3);
  const l4 = std.normalize(clipped.l4);

  let sum = integrateEdge(l0, l1) + integrateEdge(l1, l2) + integrateEdge(l2, l3);
  if (clipped.count >= d.u32(4)) {
    sum += integrateEdge(l3, l4);
  }
  if (clipped.count === d.u32(5)) {
    sum += integrateEdge(l4, l0);
  }

  return std.abs(sum);
}

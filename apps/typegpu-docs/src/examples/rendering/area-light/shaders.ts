import tgpu, { d, std } from 'typegpu';
import { HorizonClip, ltcLayout, sceneLayout, Vertex, vertexLayout } from './schemas.ts';

export { vertexLayout };

const LUT_SIZE = 64;
const LUT_SCALE = (LUT_SIZE - 1) / LUT_SIZE;
const LUT_BIAS = 0.5 / LUT_SIZE;

function saturate(value: number) {
  'use gpu';
  return std.clamp(value, 0, 1);
}

function luminance(color: d.v3f) {
  'use gpu';
  return std.dot(color, d.vec3f(0.2126, 0.7152, 0.0722));
}

function integrateEdgeVec(v1: d.v3f, v2: d.v3f) {
  'use gpu';
  const x = std.dot(v1, v2);
  const y = std.abs(x);
  const a = 0.8543985 + (0.4965155 + 0.0145206 * y) * y;
  const b = 3.417594 + (4.1616724 + y) * y;
  const v = a / b;
  const thetaSinTheta = std.select(0.5 * std.inverseSqrt(std.max(1 - x * x, 1e-7)) - v, v, x > 0);
  return std.cross(v1, v2) * thetaSinTheta;
}

function integrateEdge(v1: d.v3f, v2: d.v3f) {
  'use gpu';
  return integrateEdgeVec(v1, v2).z;
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

function ltcEvaluate(N: d.v3f, V: d.v3f, P: d.v3f, Minv: d.m3x3f) {
  'use gpu';
  let T1 = V - N * std.dot(V, N);
  if (std.dot(T1, T1) < 1e-5) {
    let up = d.vec3f(0, 0, 1);
    if (std.abs(N.z) > 0.999) {
      up = d.vec3f(0, 1, 0);
    }
    T1 = std.cross(up, N);
  }
  T1 = std.normalize(T1);
  const T2 = std.cross(N, T1);

  const light = sceneLayout.$.light;
  const ex = light.dirX * light.halfSize.x;
  const ey = light.dirY * light.halfSize.y;
  const p0 = light.center - ex - ey;
  const p1 = light.center + ex - ey;
  const p2 = light.center + ex + ey;
  const p3 = light.center - ex + ey;

  const basis = std.transpose(d.mat3x3f(T1, T2, N));
  const transform = Minv * basis;

  const clipped = clipQuadToHorizon(
    transform * (p0 - P),
    transform * (p1 - P),
    transform * (p2 - P),
    transform * (p3 - P),
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

function sampleLtcTexelMat(x: number, y: number) {
  'use gpu';
  const coord = d.vec2u(d.u32(x), d.u32(y));
  return std.textureLoad(ltcLayout.$.ltcMat, coord, 0);
}

function sampleLtcTexelAmp(x: number, y: number) {
  'use gpu';
  const coord = d.vec2u(d.u32(x), d.u32(y));
  return std.textureLoad(ltcLayout.$.ltcAmp, coord, 0);
}

function sampleLtcBilinearMat(uv: d.v2f) {
  'use gpu';
  const pos = std.clamp(uv * LUT_SIZE - 0.5, d.vec2f(0), d.vec2f(LUT_SIZE - 1));
  const base = std.floor(pos);
  const frac = pos - base;
  const next = std.min(base + 1, d.vec2f(LUT_SIZE - 1));

  const t00 = sampleLtcTexelMat(base.x, base.y);
  const t10 = sampleLtcTexelMat(next.x, base.y);
  const t01 = sampleLtcTexelMat(base.x, next.y);
  const t11 = sampleLtcTexelMat(next.x, next.y);

  return std.mix(std.mix(t00, t10, frac.x), std.mix(t01, t11, frac.x), frac.y);
}

function sampleLtcAmp(uv: d.v2f) {
  'use gpu';
  const pos = std.clamp(uv * LUT_SIZE - 0.5, d.vec2f(0), d.vec2f(LUT_SIZE - 1));
  const base = std.floor(pos);
  const frac = pos - base;
  const next = std.min(base + 1, d.vec2f(LUT_SIZE - 1));

  const t00 = sampleLtcTexelAmp(base.x, base.y);
  const t10 = sampleLtcTexelAmp(next.x, base.y);
  const t01 = sampleLtcTexelAmp(base.x, next.y);
  const t11 = sampleLtcTexelAmp(next.x, next.y);

  return std.mix(std.mix(t00, t10, frac.x), std.mix(t01, t11, frac.x), frac.y);
}

function sampleLtcMat(uv: d.v2f) {
  'use gpu';
  const t = sampleLtcBilinearMat(uv);
  return d.mat3x3f(d.vec3f(t.x, 0, t.y), d.vec3f(0, 1, 0), d.vec3f(t.z, 0, t.w));
}

function tonemap(color: d.v3f) {
  'use gpu';
  const exposed = color * sceneLayout.$.params.exposure;
  const mapped = exposed / (exposed + 1);
  return std.pow(std.max(mapped, d.vec3f(0)), d.vec3f(1 / 2.2));
}

export const mainVertex = tgpu.vertexFn({
  in: Vertex.propTypes,
  out: {
    pos: d.builtin.position,
    worldPos: d.vec3f,
    normal: d.vec3f,
    albedo: d.vec3f,
    roughness: d.f32,
    emissive: d.vec3f,
  },
})(({ position, normal, albedo, roughness, emissive }) => {
  'use gpu';
  const camera = sceneLayout.$.camera;
  return {
    pos: camera.projection * camera.view * d.vec4f(position, 1),
    worldPos: position,
    normal,
    albedo,
    roughness,
    emissive,
  };
});

export const mainFragment = tgpu.fragmentFn({
  in: {
    worldPos: d.vec3f,
    normal: d.vec3f,
    albedo: d.vec3f,
    roughness: d.f32,
    emissive: d.vec3f,
  },
  out: d.vec4f,
})(({ worldPos, normal, albedo, roughness, emissive }) => {
  'use gpu';
  if (luminance(emissive) > 0) {
    return d.vec4f(tonemap(emissive), 1);
  }

  const N = std.normalize(normal);
  const V = std.normalize(sceneLayout.$.camera.position.xyz - worldPos);
  const NdotV = saturate(std.dot(N, V));
  const uv = d.vec2f(std.clamp(roughness, 0.01, 1), std.sqrt(1 - NdotV)) * LUT_SCALE + LUT_BIAS;

  const Minv = sampleLtcMat(uv);
  const brdf = sampleLtcAmp(uv);

  const diffuse = ltcEvaluate(N, V, worldPos, d.mat3x3f.identity());
  const specularLtc = ltcEvaluate(N, V, worldPos, Minv);
  const specularColor = d.vec3f(0.04 * sceneLayout.$.params.specularStrength);
  const specular = (specularColor * brdf.x + (1 - specularColor) * brdf.y) * specularLtc;

  const direct =
    sceneLayout.$.light.color * sceneLayout.$.light.intensity * (albedo * diffuse + specular);
  const ambient = albedo * sceneLayout.$.params.ambient;
  return d.vec4f(tonemap(direct + ambient), 1);
});

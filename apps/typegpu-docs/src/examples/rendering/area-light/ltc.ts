import { d, std } from 'typegpu';
import { RectLight, ltcLayout } from './schemas.ts';

const LUT_SIZE = 64;
const LUT_SCALE = (LUT_SIZE - 1) / LUT_SIZE;
const LUT_BIAS = 0.5 / LUT_SIZE;

export function ltcUv(roughness: number, NdotV: number) {
  'use gpu';
  return d.vec2f(roughness, std.sqrt(1 - NdotV)) * LUT_SCALE + LUT_BIAS;
}

export function sampleLtcMatrix(uv: d.v2f) {
  'use gpu';
  const t = std.textureSampleLevel(ltcLayout.$.ltcMat, ltcLayout.$.ltcSampler, uv, 0);
  return d.mat3x3f(d.vec3f(t.x, 0, t.y), d.vec3f(0, 1, 0), d.vec3f(t.z, 0, t.w));
}

export function sampleLtcAmplitude(uv: d.v2f) {
  'use gpu';
  return std.textureSampleLevel(ltcLayout.$.ltcAmp, ltcLayout.$.ltcSampler, uv, 0);
}

function edgeVectorFormFactor(from: d.v3f, to: d.v3f) {
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
  return std.cross(from, to) * thetaSinTheta;
}

function clippedSphereFormFactor(vectorIrradiance: d.v3f) {
  'use gpu';
  const len = std.length(vectorIrradiance);
  return std.max((len * len + vectorIrradiance.z) / (len + 1), 0);
}

function quadFormFactor(c0: d.v3f, c1: d.v3f, c2: d.v3f, c3: d.v3f, winding: number) {
  'use gpu';
  const l0 = std.normalize(c0);
  const l1 = std.normalize(c1);
  const l2 = std.normalize(c2);
  const l3 = std.normalize(c3);

  const vectorIrradiance =
    edgeVectorFormFactor(l0, l1) +
    edgeVectorFormFactor(l1, l2) +
    edgeVectorFormFactor(l2, l3) +
    edgeVectorFormFactor(l3, l0);

  return clippedSphereFormFactor(vectorIrradiance * winding);
}

export function ltcRectFormFactors(
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
  const tangentBasis = std.transpose(d.mat3x3f(tangent, bitangent, normal));

  const edgeU = light.dirX * light.halfSize.x;
  const edgeV = light.dirY * light.halfSize.y;
  const toCenter = light.center - worldPos;

  const c0 = tangentBasis * (toCenter - edgeU - edgeV);
  const c1 = tangentBasis * (toCenter + edgeU - edgeV);
  const c2 = tangentBasis * (toCenter + edgeU + edgeV);
  const c3 = tangentBasis * (toCenter - edgeU + edgeV);

  const winding = std.sign(std.dot(std.cross(light.dirX, light.dirY), toCenter));

  return d.vec2f(
    quadFormFactor(c0, c1, c2, c3, winding),
    quadFormFactor(
      ltcInverseTransform * c0,
      ltcInverseTransform * c1,
      ltcInverseTransform * c2,
      ltcInverseTransform * c3,
      winding,
    ),
  );
}

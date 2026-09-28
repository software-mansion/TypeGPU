import { d, std } from 'typegpu';

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
  return F0 + (1 - F0) * f;
}

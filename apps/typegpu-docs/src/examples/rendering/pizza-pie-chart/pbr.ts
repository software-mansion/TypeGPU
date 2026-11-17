import { perlin3d } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';
import { PI } from './constants.ts';

import { Light, Material } from './types.ts';

export const SUN = tgpu.const(Light, {
  color: d.vec3f(4),
  position: d.vec3f(-3, 10, 0),
});

export const distributionGGX = (ndoth: number, roughness: number): number => {
  'use gpu';
  const a = roughness ** 2;
  const a2 = a ** 2;
  const denom = std.max(ndoth ** 2 * (a2 - 1) + 1, 1e-4);
  return a2 / (PI * denom ** 2);
};

export const geometrySchlickGGX = (ndot: number, roughness: number): number => {
  'use gpu';
  const k = (roughness + 1) ** 2 / 8;
  return ndot / (ndot * (1 - k) + k);
};

export const geometrySmith = (
  ndotv: number,
  ndotl: number,
  roughness: number,
): number => {
  'use gpu';
  return (
    geometrySchlickGGX(ndotv, roughness) * geometrySchlickGGX(ndotl, roughness)
  );
};

export const fresnelSchlick = (cosTheta: number, f0: d.v3f): d.v3f => {
  'use gpu';
  return f0 + (1 - f0) * ((1 - cosTheta) ** 5);
};

export const evaluateDirectionalLight = (
  p: d.v3f,
  n: d.v3f,
  v: d.v3f,
  light: d.Infer<typeof Light>,
  material: d.Infer<typeof Material>,
  f0: d.v3f,
): d.v3f => {
  'use gpu';
  const l = std.normalize(light.position - p);
  const h = std.normalize(v + l);
  const radiance = light.color;

  const ndotl = std.max(std.dot(n, l), 0);
  const ndoth = std.max(std.dot(n, h), 0);
  const ndotv = std.max(std.dot(n, v), 0.001);

  const ndf = distributionGGX(ndoth, material.roughness);
  const g = geometrySmith(ndotv, ndotl, material.roughness);
  const fresnel = fresnelSchlick(ndoth, f0);

  const specular = fresnel * (ndf * g) / (4 * ndotv * ndotl + 0.001);
  const kd = (1 - fresnel) * (1 - material.metallic);

  return (kd * material.albedo / PI + specular) * radiance * ndotl;
};

export const shade = (
  p: d.v3f,
  n: d.v3f,
  v: d.v3f,
  shadow: number,
  material: d.Infer<typeof Material>,
): d.v3f => {
  'use gpu';
  const f0 = std.mix(d.vec3f(0.04), material.albedo, material.metallic);

  let lo = d.vec3f(0);
  // TODO: Do not clone once passing constant references to functions is okay
  lo += evaluateDirectionalLight(p, n, v, Light(SUN.$), material, f0);

  const reflectDir = std.reflect(v, n);

  const pScaled = p * 50;
  const roughOffset = d.vec3f(
    perlin3d.sample(pScaled),
    perlin3d.sample(pScaled + 100),
    perlin3d.sample(pScaled + 200),
  ) * material.roughness * 0.3;
  const blurredReflectDir = std.normalize(reflectDir + roughOffset);

  // TODO: Add proper env color
  // const envColor = d.vec4f(0, 0, 0, 1);
  const envColor = d.vec4f(1, 1, 1, 1);

  const ndotv = std.max(std.dot(n, v), 0);

  const fresnel = fresnelSchlick(ndotv, f0);

  const reflectionTint = std.mix(
    d.vec3f(1),
    material.albedo,
    material.metallic,
  );

  const reflectionStrength = 1 - material.roughness * 0.85;

  const envContribution = envColor.rgb
    .mul(fresnel)
    .mul(reflectionTint)
    .mul(reflectionStrength);

  const ambient = material.albedo * material.ao * 0.05;
  const color = ambient + (lo + envContribution) * shadow;
  return std.pow(color / (color + 1), d.vec3f(1 / 2.2));
};

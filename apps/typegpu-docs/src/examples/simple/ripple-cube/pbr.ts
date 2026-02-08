import { perlin3d } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';
import { LIGHT_COUNT, PI } from './constants.ts';
import { softShadow } from './sdf-scene.ts';
import { Light, Material } from './types.ts';

export const envMapLayout = tgpu.bindGroupLayout({
  envMap: { texture: d.textureCube(d.f32) },
  envSampler: { sampler: 'filtering' },
});

export const materialAccess = tgpu['~unstable'].accessor(Material);
export const lightsAccess = tgpu['~unstable'].accessor(
  d.arrayOf(Light, LIGHT_COUNT),
);

export const distributionGGX = (ndoth: number, roughness: number): number => {
  'use gpu';
  const a = roughness * roughness;
  const a2 = a * a;
  const denom = std.max(ndoth * ndoth * (a2 - 1) + 1, 1e-4);
  return a2 / (PI * denom * denom);
};

export const geometrySchlickGGX = (ndot: number, roughness: number): number => {
  'use gpu';
  const k = ((roughness + 1) * (roughness + 1)) / 8;
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
  return f0.add(
    d
      .vec3f(1)
      .sub(f0)
      .mul(std.pow(1 - cosTheta, 5)),
  );
};

export const evaluateLight = (
  p: d.v3f,
  n: d.v3f,
  v: d.v3f,
  light: d.Infer<typeof Light>,
  material: d.Infer<typeof Material>,
  f0: d.v3f,
): d.v3f => {
  'use gpu';
  const toLight = light.position.sub(p);
  const dist = std.length(toLight);
  const l = std.normalize(toLight);
  const h = std.normalize(v.add(l));
  const radiance = light.color.mul(1 / dist ** 2);

  const shadow = softShadow(p.add(n.mul(0.01)), l, dist);

  const ndotl = std.max(std.dot(n, l), 0);
  const ndoth = std.max(std.dot(n, h), 0);
  const ndotv = std.max(std.dot(n, v), 0.001);

  const ndf = distributionGGX(ndoth, material.roughness);
  const g = geometrySmith(ndotv, ndotl, material.roughness);
  const fresnel = fresnelSchlick(ndoth, f0);

  const specular = fresnel.mul((ndf * g) / (4 * ndotv * ndotl + 0.001));
  const kd = d
    .vec3f(1)
    .sub(fresnel)
    .mul(1 - material.metallic);

  return kd
    .mul(material.albedo)
    .div(PI)
    .add(specular)
    .mul(radiance)
    .mul(ndotl)
    .mul(shadow);
};

export const shade = (p: d.v3f, n: d.v3f, v: d.v3f): d.v3f => {
  'use gpu';
  const material = materialAccess.$;
  const f0 = std.mix(d.vec3f(0.04), material.albedo, material.metallic);

  let lo = d.vec3f(0);
  for (let i = 0; i < LIGHT_COUNT; i++) {
    lo = lo.add(evaluateLight(p, n, v, lightsAccess.$[i], material, f0));
  }

  const reflectDir = std.reflect(v, n);

  const roughOffset = d
    .vec3f(
      perlin3d.sample(p.mul(50)) - 0.5,
      perlin3d.sample(p.mul(50).add(100)) - 0.5,
      perlin3d.sample(p.mul(50).add(200)) - 0.5,
    )
    .mul(material.roughness * 0.5);
  const blurredReflectDir = std.normalize(reflectDir.add(roughOffset));

  const envColor = std.textureSampleLevel(
    envMapLayout.$.envMap,
    envMapLayout.$.envSampler,
    blurredReflectDir,
    0,
  );

  const ndotv = std.max(std.dot(n, v), 0);

  const fresnel = f0.add(
    d
      .vec3f(1)
      .sub(f0)
      .mul(std.pow(1 - ndotv, 5)),
  );

  const reflectionTint = std.mix(
    d.vec3f(1),
    material.albedo,
    material.metallic,
  );

  const reflectionStrength = 1 - material.roughness * 0.85;

  const envContribution = envColor.xyz
    .mul(fresnel)
    .mul(reflectionTint)
    .mul(reflectionStrength);

  const ambient = d.vec3f(0.05).mul(material.albedo).mul(material.ao);
  const color = ambient.add(lo).add(envContribution);
  return std.pow(color.div(color.add(1)), d.vec3f(1 / 2.2));
};

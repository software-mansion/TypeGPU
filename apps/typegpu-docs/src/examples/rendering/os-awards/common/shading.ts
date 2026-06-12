import tgpu, { d, std, type TgpuBindGroup } from 'typegpu';
import { distributionGGX, fresnelSchlick, geometrySmith } from './pbr.ts';
import { scene } from '../scene.ts';
import { Camera } from '../../../common/setup-orbit-camera.ts';

export const AwardMaterial = d.struct({
  baseColorFactor: d.vec4f,
  metallicFactor: d.f32,
  roughnessFactor: d.f32,
});

export const DirectLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
  strength: d.f32,
});

export const PbrSurface = d.struct({
  albedo: d.vec3f,
  roughness: d.f32,
  metallic: d.f32,
  normal: d.vec3f,
  viewDir: d.vec3f,
  f0: d.vec3f,
  nDotV: d.f32,
});

export const MaterialSample = d.struct({
  albedo: d.vec3f,
  roughness: d.f32,
  metallic: d.f32,
});

export const sharedLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  awardTransform: { uniform: d.mat4x4f },
  awardTransformInverse: { uniform: d.mat4x4f },
  material: { uniform: AwardMaterial },
  cubemap: { texture: d.textureCube(d.f32) },
  equirect: { texture: d.texture2d(d.f32) },
  baseColor: { texture: d.texture2d(d.f32) },
  metallicRoughness: { texture: d.texture2d(d.f32) },
  filteringSampler: { sampler: 'filtering' },
});

export type SharedBindGroup = TgpuBindGroup<(typeof sharedLayout)['entries']>;

export const tonemapForDisplay = (color: d.v3f): d.v3f => {
  'use gpu';
  const exposed = color * scene.display.exposure;
  const mapped = (exposed * (2.51 * exposed + 0.03)) / (exposed * (2.43 * exposed + 0.59) + 0.14);
  return std.pow(std.saturate(mapped), scene.display.gamma);
};

export const sampleEnv = (dir: d.v3f, lod: number): d.v3f => {
  'use gpu';
  return std.textureSampleLevel(
    sharedLayout.$.cubemap,
    sharedLayout.$.filteringSampler,
    dir,
    d.f32(lod),
  ).rgb;
};

export const primaryRayDir = (uv: d.v2f): d.v3f => {
  'use gpu';
  const ndc = d.vec4f(uv.x * 2 - 1, 1 - uv.y * 2, 1, 1);
  const viewPos = sharedLayout.$.camera.projectionInverse * ndc;
  const viewDir = std.normalize(viewPos.xyz / viewPos.w);
  return std.normalize((sharedLayout.$.camera.viewInverse * d.vec4f(viewDir, 0)).xyz);
};

export const modelDirToWorld = (v: d.v3f): d.v3f => {
  'use gpu';
  return std.normalize((sharedLayout.$.awardTransform * d.vec4f(v, 0)).xyz);
};

export const sampleMaterial = (uv: d.v2f): d.InferGPU<typeof MaterialSample> => {
  'use gpu';
  const albedo =
    std.textureSample(sharedLayout.$.baseColor, sharedLayout.$.filteringSampler, uv).rgb *
    sharedLayout.$.material.baseColorFactor.rgb;
  const metallicRoughness = std.textureSample(
    sharedLayout.$.metallicRoughness,
    sharedLayout.$.filteringSampler,
    uv,
  );
  return MaterialSample({
    albedo,
    roughness: metallicRoughness.g * sharedLayout.$.material.roughnessFactor,
    metallic: metallicRoughness.b * sharedLayout.$.material.metallicFactor,
  });
};

export const isInEpoxyRegion = (modelPos: d.v3f): boolean => {
  'use gpu';
  return (
    std.all(std.ge(modelPos, scene.epoxy.bounds.min)) &&
    std.all(std.le(modelPos, scene.epoxy.bounds.max))
  );
};

const shadeDirectLight = (
  surface: d.InferGPU<typeof PbrSurface>,
  light: d.InferGPU<typeof DirectLight>,
): d.v3f => {
  'use gpu';
  const lightDirection = std.normalize(light.direction);
  const halfDir = std.normalize(surface.viewDir + lightDirection);

  const NdotL = std.max(std.dot(surface.normal, lightDirection), 0);
  const NdotH = std.max(std.dot(surface.normal, halfDir), 0);
  const HdotV = std.max(std.dot(halfDir, surface.viewDir), 0);

  const F = fresnelSchlick(HdotV, surface.f0);
  const D = distributionGGX(NdotH, surface.roughness);
  const G = geometrySmith(surface.nDotV, NdotL, surface.roughness);

  const kD = (1 - F) * (1 - surface.metallic);
  const diffuse = (kD * surface.albedo) / Math.PI;
  const specular = (F * D * G) / std.max(4 * surface.nDotV * NdotL, 0.001);
  return (diffuse + specular) * light.color * (NdotL * light.strength);
};

export const shadeDirectLights = (surface: d.InferGPU<typeof PbrSurface>): d.v3f => {
  'use gpu';
  let direct = d.vec3f();
  for (const light of tgpu.unroll(scene.lighting.directLights)) {
    direct += shadeDirectLight(surface, DirectLight(light));
  }

  return (
    direct +
    shadeDirectLight(
      surface,
      DirectLight({
        direction: surface.viewDir,
        color: scene.lighting.cameraFill.color,
        strength: scene.lighting.cameraFill.strength,
      }),
    )
  );
};

export const shadeOpaque = (
  albedo: d.v3f,
  roughness: number,
  metallic: number,
  normal: d.v3f,
  worldPos: d.v3f,
): d.v3f => {
  'use gpu';
  const materialRoughness = std.clamp(roughness, 0.04, 1);
  const materialMetallic = std.saturate(metallic);
  const viewDir = std.normalize(sharedLayout.$.camera.position.xyz - worldPos);
  const surface = PbrSurface({
    albedo,
    roughness: materialRoughness,
    metallic: materialMetallic,
    normal,
    viewDir,
    f0: std.mix(scene.lighting.dielectricF0, albedo, materialMetallic),
    nDotV: std.max(std.dot(normal, viewDir), 0),
  });
  const direct = shadeDirectLights(surface);

  const ambientF = fresnelSchlick(surface.nDotV, surface.f0);
  const ambientKD = (1 - ambientF) * (1 - surface.metallic);
  const ambientDiffuseBRDF = (ambientKD * surface.albedo) / Math.PI;
  const irradiance = sampleEnv(surface.normal, scene.environment.irradianceMipBias);
  const ambientDiffuse = irradiance * ambientDiffuseBRDF * scene.lighting.ambientStrength;

  const reflected = std.reflect(std.neg(surface.viewDir), surface.normal);
  const reflection = sampleEnv(
    reflected,
    surface.roughness * surface.roughness * scene.environment.maxSpecularMipBias,
  );
  const ambientSpecular =
    reflection * fresnelSchlick(surface.nDotV, surface.f0) * scene.lighting.ambientStrength;
  const warmVenueBounce =
    surface.albedo *
    (1 - surface.metallic) *
    scene.lighting.venueBounce.color *
    scene.lighting.venueBounce.strength;

  return ambientDiffuse + ambientSpecular + warmVenueBounce + direct;
};

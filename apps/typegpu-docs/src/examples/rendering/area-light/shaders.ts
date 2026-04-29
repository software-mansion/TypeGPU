import tgpu, { d, std } from 'typegpu';
import { perlin2d } from '@typegpu/noise';
import { ENVIRONMENT_MIP_LEVELS } from './environment.ts';
import { evaluateLtcAreaLight, ltcUv, sampleLtcAmplitude, sampleLtcMatrix } from './ltc.ts';
import { environmentLayout, LIGHT_COUNT, sceneLayout, Vertex, vertexLayout } from './schemas.ts';

export { vertexLayout };

const PI = Math.PI;

function saturate(value: number) {
  'use gpu';
  return std.clamp(value, 0, 1);
}

function fresnelSchlick(cosTheta: number, f0: d.v3f) {
  'use gpu';
  return f0 + (1 - f0) * (1 - saturate(cosTheta)) ** 5;
}

function fresnelSchlickRoughness(cosTheta: number, f0: d.v3f, roughness: number) {
  'use gpu';
  const roughF0 = std.max(d.vec3f(1 - roughness), f0);
  return f0 + (roughF0 - f0) * (1 - saturate(cosTheta)) ** 5;
}

function sampleEnvironment(direction: d.v3f, roughness: number) {
  'use gpu';
  const lod = std.clamp(roughness, d.f32(0), d.f32(1)) * d.f32(ENVIRONMENT_MIP_LEVELS - 1);
  const sample = std.textureSampleLevel(
    environmentLayout.$.environmentMap,
    environmentLayout.$.environmentSampler,
    std.normalize(direction),
    lod,
  );
  return sample.rgb * sceneLayout.$.params.environmentIntensity;
}

function tonemap(color: d.v3f) {
  'use gpu';
  const exposed = color * sceneLayout.$.params.exposure;
  const mapped = exposed / (exposed + 1);
  return std.pow(std.max(mapped, d.vec3f(0)), d.vec3f(1 / 2.2));
}

function materialF0(albedo: d.v3f, metallic: number) {
  'use gpu';
  return std.mix(d.vec3f(0.04), albedo, metallic);
}

function noise01(p: d.v2f) {
  'use gpu';
  return perlin2d.sample(p) * 0.5 + 0.5;
}

function fbm(p: d.v2f) {
  'use gpu';
  return noise01(p) * 0.55 + noise01(p * 2.3 + 19.1) * 0.3 + noise01(p * 5.1 - 8.7) * 0.15;
}

function waterNormal(N: d.v3f, worldPos: d.v3f, amount: number) {
  'use gpu';
  const t = sceneLayout.$.params.time;
  const phase = d.vec2f(std.sin(t * 0.035), std.cos(t * 0.027)) * 0.08;
  const p = worldPos.xz * 0.55 + phase;
  const center = fbm(p);
  const gradient =
    d.vec2f(fbm(p + d.vec2f(0.12, 0)) - center, fbm(p + d.vec2f(0, 0.12)) - center) * 0.55;
  const waterN = std.normalize(d.vec3f(std.neg(gradient.x), 1, std.neg(gradient.y)));

  return std.normalize(std.mix(N, waterN, amount));
}

function directAreaLighting(
  N: d.v3f,
  V: d.v3f,
  P: d.v3f,
  albedo: d.v3f,
  roughness: number,
  metallic: number,
  f0: d.v3f,
  specularBoost: number,
) {
  'use gpu';
  const uv = ltcUv(roughness, saturate(std.dot(N, V)));
  const Minv = sampleLtcMatrix(uv);
  const brdf = sampleLtcAmplitude(uv);
  const fresnel = f0 * brdf.x + (1 - f0) * brdf.y;
  const diffuse = (1 - fresnel) * (1 - metallic) * (albedo / PI);

  let result = d.vec3f(0);
  for (let i = d.u32(0); i < d.u32(LIGHT_COUNT); i++) {
    const light = sceneLayout.$.lights[i];
    const diffuseIntegral = evaluateLtcAreaLight(N, V, P, d.mat3x3f.identity(), light);
    const specularIntegral = evaluateLtcAreaLight(N, V, P, Minv, light);
    result +=
      light.color *
      light.intensity *
      (diffuse * diffuseIntegral + fresnel * specularIntegral * specularBoost);
  }

  return result;
}

function environmentLighting(
  N: d.v3f,
  V: d.v3f,
  albedo: d.v3f,
  roughness: number,
  metallic: number,
  f0: d.v3f,
  specularBoost: number,
) {
  'use gpu';
  const NdotV = saturate(std.dot(N, V));
  const fresnel = fresnelSchlickRoughness(NdotV, f0, roughness);
  const diffuse =
    (1 - fresnel) *
    (1 - metallic) *
    albedo *
    sampleEnvironment(N, d.f32(1)) *
    sceneLayout.$.params.diffuseIblStrength;
  const specular =
    sampleEnvironment(std.reflect(std.neg(V), N), roughness) *
    fresnelSchlick(NdotV, f0) *
    (1 - roughness * 0.35) *
    sceneLayout.$.params.specularIblStrength *
    specularBoost;

  return diffuse + specular;
}

export const mainVertex = tgpu.vertexFn({
  in: Vertex.propTypes,
  out: {
    pos: d.builtin.position,
    worldPos: d.vec3f,
    normal: d.vec3f,
    albedo: d.vec3f,
    roughness: d.f32,
    metallic: d.f32,
    wetness: d.f32,
  },
})(({ position, normal, albedo, roughness, metallic, wetness }) => {
  'use gpu';
  const camera = sceneLayout.$.camera;
  return {
    pos: camera.projection * camera.view * d.vec4f(position, 1),
    worldPos: position,
    normal,
    albedo,
    roughness,
    metallic,
    wetness,
  };
});

export const mainFragment = tgpu.fragmentFn({
  in: {
    worldPos: d.vec3f,
    normal: d.vec3f,
    albedo: d.vec3f,
    roughness: d.f32,
    metallic: d.f32,
    wetness: d.f32,
  },
  out: d.vec4f,
})(({ worldPos, normal, albedo, roughness, metallic, wetness }) => {
  'use gpu';
  const geometricN = std.normalize(normal);
  const V = std.normalize(sceneLayout.$.camera.position.xyz - worldPos);
  const water = wetness * sceneLayout.$.params.wetness * saturate(geometricN.y * 1.35);
  const film = water * std.mix(0.94, 1, fbm(worldPos.xz * 0.42 + 30.2));
  const wetSurface = saturate(film);
  const N = waterNormal(geometricN, worldPos, water);
  const waterRoughness = std.mix(0.055, 0.01, water);
  const materialRoughness = std.clamp(std.mix(roughness, waterRoughness, wetSurface), 0.006, 1);
  const wetAlbedo = std.mix(albedo, albedo * 0.2, wetSurface);
  const specularBoost = 1 + film * 5.8;
  const f0 = std.mix(materialF0(albedo, metallic), d.vec3f(0.08), wetSurface * (1 - metallic));
  const direct = directAreaLighting(
    N,
    V,
    worldPos,
    wetAlbedo,
    materialRoughness,
    metallic,
    f0,
    specularBoost,
  );
  const ibl = environmentLighting(N, V, wetAlbedo, materialRoughness, metallic, f0, specularBoost);

  return d.vec4f(tonemap(direct + ibl), 1);
});

export const skyVertex = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, ndc: d.vec2f },
})(({ vertexIndex }) => {
  'use gpu';
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  return {
    pos: d.vec4f(pos[vertexIndex], 0, 1),
    ndc: pos[vertexIndex],
  };
});

export const skyFragment = tgpu.fragmentFn({
  in: { ndc: d.vec2f },
  out: d.vec4f,
})(({ ndc }) => {
  'use gpu';
  const camera = sceneLayout.$.camera;
  const farView = camera.projectionInverse * d.vec4f(ndc, 1, 1);
  const farWorld = camera.viewInverse * d.vec4f(farView.xyz / farView.w, 1);
  const direction = std.normalize(farWorld.xyz - camera.position.xyz);
  return d.vec4f(tonemap(sampleEnvironment(direction, d.f32(0))), 1);
});

export const lightVertex = tgpu.vertexFn({
  in: { vid: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, color: d.vec3f },
})(({ vid }) => {
  'use gpu';
  const lightIdx = d.u32(vid / d.u32(6));
  const corners = [
    d.vec2f(-1, -1),
    d.vec2f(1, -1),
    d.vec2f(1, 1),
    d.vec2f(-1, -1),
    d.vec2f(1, 1),
    d.vec2f(-1, 1),
  ];
  const corner = corners[vid % d.u32(6)];
  const light = sceneLayout.$.lights[lightIdx];
  const worldPos =
    light.center +
    light.dirX * light.halfSize.x * corner.x +
    light.dirY * light.halfSize.y * corner.y;
  const camera = sceneLayout.$.camera;
  return {
    pos: camera.projection * camera.view * d.vec4f(worldPos, 1),
    color: light.color * light.intensity,
  };
});

export const lightFragment = tgpu.fragmentFn({
  in: { color: d.vec3f },
  out: d.vec4f,
})(({ color }) => {
  'use gpu';
  return d.vec4f(tonemap(color), 1);
});

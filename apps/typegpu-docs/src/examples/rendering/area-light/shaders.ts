import tgpu, { d, std } from 'typegpu';
import { evaluateLtcAreaLight, ltcUv, sampleLtcAmplitude, sampleLtcMatrix } from './ltc.ts';
import { environmentLayout, LIGHT_COUNT, sceneLayout, Vertex, vertexLayout } from './schemas.ts';

export { vertexLayout };

const PI = Math.PI;
const SCALAR_ENVIRONMENT_LUMA = 0.085;

function fresnelSchlick(cosTheta: number, f0: d.v3f) {
  'use gpu';
  return f0 + (1 - f0) * (1 - std.saturate(cosTheta)) ** 5;
}

function fresnelSchlickRoughness(cosTheta: number, f0: d.v3f, roughness: number) {
  'use gpu';
  const roughF0 = std.max(d.vec3f(1 - roughness), f0);
  return f0 + (roughF0 - f0) * (1 - std.saturate(cosTheta)) ** 5;
}

function sampleSkyEnvironment(direction: d.v3f) {
  'use gpu';
  const sample = std.textureSampleLevel(
    environmentLayout.$.environmentMap,
    environmentLayout.$.environmentSampler,
    std.normalize(direction),
    0,
  );
  return sample.rgb * sceneLayout.$.params.environmentIntensity;
}

function tonemap(color: d.v3f) {
  'use gpu';
  const exposed = color * sceneLayout.$.params.exposure;
  const mapped = exposed / (exposed + 1);
  return std.pow(std.max(mapped, d.vec3f(0)), d.vec3f(1 / 2.2));
}

function waveSlope(
  xz: d.v2f,
  direction: d.v2f,
  frequency: number,
  speed: number,
  amplitude: number,
  t: number,
) {
  'use gpu';
  const dir = std.normalize(direction);
  const phase = std.dot(xz, dir) * frequency + t * speed;
  return dir * (std.cos(phase) * amplitude * frequency);
}

function waveGradient(worldPos: d.v3f, t: number) {
  'use gpu';
  const xz = worldPos.xz;
  return (
    waveSlope(xz, d.vec2f(1, 0.18), 5.6, 1.15, 0.035, t) +
    waveSlope(xz, d.vec2f(-0.42, 1), 4.1, -0.8, 0.028, t) +
    waveSlope(xz, d.vec2f(0.73, -0.64), 8.2, 1.9, 0.012, t) +
    waveSlope(xz, d.vec2f(-0.95, -0.28), 10.6, -2.2, 0.007, t)
  );
}

function waterFilm(worldPos: d.v3f, t: number) {
  'use gpu';
  const xz = worldPos.xz;
  const shimmer =
    std.sin(std.dot(xz, d.vec2f(1.4, 0.34)) + t * 0.62) * 0.5 +
    std.sin(std.dot(xz, d.vec2f(-0.46, 1.25)) - t * 0.47) * 0.5;
  return std.saturate(0.93 + shimmer * 0.06);
}

function waterNormal(N: d.v3f, worldPos: d.v3f, amount: number) {
  'use gpu';
  const t = sceneLayout.$.params.time;
  const gradient = waveGradient(worldPos, t);
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
  const uv = ltcUv(roughness, std.saturate(std.dot(N, V)));
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
  const NdotV = std.saturate(std.dot(N, V));
  const env = sceneLayout.$.params.environmentIntensity * SCALAR_ENVIRONMENT_LUMA;
  const fresnel = fresnelSchlickRoughness(NdotV, f0, roughness);
  const diffuse =
    (1 - fresnel) * (1 - metallic) * albedo * env * sceneLayout.$.params.diffuseIblStrength;
  const specular =
    fresnelSchlick(NdotV, f0) *
    env *
    (1 - roughness * 0.35) *
    sceneLayout.$.params.specularIblStrength *
    specularBoost;

  return diffuse + specular;
}

export const mainFragment = tgpu.fragmentFn({
  in: {
    worldPos: d.vec3f,
    normal: d.vec3f,
    albedo: d.vec3f,
    material: d.vec3f,
    frontFacing: d.builtin.frontFacing,
  },
  out: d.vec4f,
})(({ worldPos, normal, albedo, material, frontFacing }) => {
  'use gpu';
  const roughness = material.x;
  const metallic = material.y;
  const wetness = material.z;
  const meshN = std.normalize(normal);
  const geometricN = std.select(std.neg(meshN), meshN, frontFacing);
  const V = std.normalize(sceneLayout.$.camera.position.xyz - worldPos);
  const water = wetness * sceneLayout.$.params.wetness * std.saturate(geometricN.y * 1.35);
  const film = water * waterFilm(worldPos, sceneLayout.$.params.time);
  const wetSurface = std.saturate(film);
  const N = waterNormal(geometricN, worldPos, std.saturate(water * 1.35));
  const waterRoughness = std.mix(0.065, 0.032, water);
  const materialRoughness = std.clamp(std.mix(roughness, waterRoughness, wetSurface), 0.006, 1);
  const wetAlbedo = std.mix(albedo, albedo * 0.44, wetSurface);
  const specularBoost = 1 + film * 3.2;
  const f0 = std.mix(
    std.mix(d.vec3f(0.04), albedo, metallic),
    d.vec3f(0.08),
    wetSurface * (1 - metallic),
  );
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
  return d.vec4f(tonemap(sampleSkyEnvironment(direction)), 1);
});

export const lightVertex = tgpu.vertexFn({
  in: { vid: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, color: d.vec3f },
})(({ vid }) => {
  'use gpu';
  const lightIdx = std.floor(vid / 6);
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

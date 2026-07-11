import { d, std, tgpu } from 'typegpu';
import { ltcRectFormFactors, ltcUv, sampleLtcAmplitude, sampleLtcMatrix } from './ltc.ts';
import { LIGHT_COUNT, sceneLayout } from './schemas.ts';

const SCALAR_ENVIRONMENT_LUMA = 0.085;
const DIFFUSE_IBL_STRENGTH = 0.06;
const SPECULAR_IBL_STRENGTH = 0.95;
const WETNESS = 0.12;

const ENV_GROUND = d.vec3f(0.012, 0.008, 0.018);
const ENV_HORIZON = d.vec3f(0.062, 0.026, 0.072);
const ENV_ZENITH = d.vec3f(0.02, 0.013, 0.036);
const ENV_HORIZON_GLOW = d.vec3f(0.22, 0.06, 0.1);

const ENV_GLOWS = [
  {
    dir: std.normalize(d.vec3f(-0.5, 0.18, 0.85)),
    tint: d.vec3f(1, 0.2, 0.5),
    power: 16,
    strength: 0.5,
  },
  {
    dir: std.normalize(d.vec3f(0.7, 0.08, -0.65)),
    tint: d.vec3f(0.55, 0.22, 1),
    power: 22,
    strength: 0.3,
  },
  {
    dir: std.normalize(d.vec3f(-0.25, -0.05, 1)),
    tint: d.vec3f(1, 0.45, 0.12),
    power: 28,
    strength: 0.25,
  },
];

const WAVES = [
  { dir: std.normalize(d.vec2f(1, 0.18)), frequency: 5.6, speed: 1.15, amplitude: 0.035 },
  { dir: std.normalize(d.vec2f(-0.42, 1)), frequency: 4.1, speed: -0.8, amplitude: 0.028 },
  { dir: std.normalize(d.vec2f(0.73, -0.64)), frequency: 8.2, speed: 1.9, amplitude: 0.012 },
  { dir: std.normalize(d.vec2f(-0.95, -0.28)), frequency: 10.6, speed: -2.2, amplitude: 0.007 },
];

const lightQuadCorners = tgpu.const(d.arrayOf(d.vec2f, 6), [
  d.vec2f(-1, -1),
  d.vec2f(1, -1),
  d.vec2f(1, 1),
  d.vec2f(-1, -1),
  d.vec2f(1, 1),
  d.vec2f(-1, 1),
]);

const skyTriangleNdc = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(-1, -1),
  d.vec2f(3, -1),
  d.vec2f(-1, 3),
]);

const Surface = d.struct({
  normal: d.vec3f,
  viewDir: d.vec3f,
  worldPos: d.vec3f,
  albedo: d.vec3f,
  f0: d.vec3f,
  roughness: d.f32,
  metallic: d.f32,
  specularBoost: d.f32,
});

function fresnelSchlick(cosTheta: number, f0: d.v3f) {
  'use gpu';
  return f0 + (1 - f0) * (1 - std.saturate(cosTheta)) ** 5;
}

function fresnelSchlickRoughness(cosTheta: number, f0: d.v3f, roughness: number) {
  'use gpu';
  const clampedF0 = std.max(d.vec3f(1 - roughness), f0);
  return f0 + (clampedF0 - f0) * (1 - std.saturate(cosTheta)) ** 5;
}

function sampleEnvironment(direction: d.v3f) {
  'use gpu';
  const dir = std.normalize(direction);
  const t = std.saturate(dir.y * 0.5 + 0.5);
  const upMask = std.smoothstep(0.5, 1, t);
  const downMask = 1 - std.smoothstep(0, 0.5, t);
  let color = std.mix(std.mix(ENV_HORIZON, ENV_ZENITH, upMask), ENV_GROUND, downMask);

  const horizonBand = 1 - std.smoothstep(0, 0.22, std.abs(dir.y));
  color += ENV_HORIZON_GLOW * horizonBand * 0.45;

  for (const g of tgpu.unroll(ENV_GLOWS)) {
    const lobe = std.max(std.dot(dir, g.dir), 0) ** d.f32(g.power);
    color += g.tint * lobe * g.strength;
  }
  return color;
}

function sampleSkyEnvironment(direction: d.v3f) {
  'use gpu';
  return sampleEnvironment(direction) * sceneLayout.$.params.environmentIntensity;
}

function tonemap(color: d.v3f) {
  'use gpu';
  const exposed = color * sceneLayout.$.params.exposure;
  const mapped = exposed / (exposed + 1);
  return std.pow(std.max(mapped, d.vec3f(0)), d.vec3f(1 / 2.2));
}

function waveGradient(worldPos: d.v3f, t: number) {
  'use gpu';
  const xz = worldPos.xz;
  let slope = d.vec2f();
  for (const wave of tgpu.unroll(WAVES)) {
    const phase = std.dot(xz, wave.dir) * wave.frequency + t * wave.speed;
    slope += wave.dir * (std.cos(phase) * (wave.amplitude * wave.frequency));
  }
  return slope;
}

function waterFilm(worldPos: d.v3f, t: number) {
  'use gpu';
  const xz = worldPos.xz;
  const shimmer =
    std.sin(std.dot(xz, d.vec2f(1.4, 0.34)) + t * 0.62) * 0.5 +
    std.sin(std.dot(xz, d.vec2f(-0.46, 1.25)) - t * 0.47) * 0.5;
  return std.saturate(0.93 + shimmer * 0.06);
}

function waterNormal(baseNormal: d.v3f, worldPos: d.v3f, intensity: number) {
  'use gpu';
  const slope = waveGradient(worldPos, sceneLayout.$.params.time);
  const rippledNormal = std.normalize(d.vec3f(-slope.x, 1, -slope.y));

  return std.normalize(std.mix(baseNormal, rippledNormal, intensity));
}

function evaluateLighting(surface: d.Infer<typeof Surface>) {
  'use gpu';
  const NdotV = std.saturate(std.dot(surface.normal, surface.viewDir));

  const lutUv = ltcUv(surface.roughness, NdotV);
  const ltcInverseTransform = sampleLtcMatrix(lutUv);
  const ltcCoeffs = sampleLtcAmplitude(lutUv);
  const ltcFresnel = surface.f0 * ltcCoeffs.x + (1 - surface.f0) * ltcCoeffs.y;
  const diffuseLobe = (1 - ltcFresnel) * (1 - surface.metallic) * surface.albedo;

  let directLight = d.vec3f(0);
  for (const i of tgpu.unroll(std.range(LIGHT_COUNT))) {
    const light = sceneLayout.$.lights[i];
    const formFactors = ltcRectFormFactors(
      surface.normal,
      surface.viewDir,
      surface.worldPos,
      ltcInverseTransform,
      light,
    );
    directLight +=
      light.color *
      light.intensity *
      (diffuseLobe * formFactors.x + ltcFresnel * formFactors.y * surface.specularBoost);
  }

  const envLuminance = sceneLayout.$.params.environmentIntensity * SCALAR_ENVIRONMENT_LUMA;
  const envFresnel = fresnelSchlickRoughness(NdotV, surface.f0, surface.roughness);
  const indirectDiffuse =
    (1 - envFresnel) *
    (1 - surface.metallic) *
    surface.albedo *
    envLuminance *
    DIFFUSE_IBL_STRENGTH;
  const indirectSpecular =
    fresnelSchlick(NdotV, surface.f0) *
    envLuminance *
    (1 - surface.roughness * 0.35) *
    SPECULAR_IBL_STRENGTH *
    surface.specularBoost;

  return directLight + indirectDiffuse + indirectSpecular;
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

  const vertexNormal = std.normalize(normal);
  const surfaceNormal = std.select(std.neg(vertexNormal), vertexNormal, frontFacing);
  const viewDir = std.normalize(sceneLayout.$.camera.position.xyz - worldPos);

  const wetMask = wetness * WETNESS * std.saturate(surfaceNormal.y * 1.35);
  let film = d.f32(0);
  let shadingNormal = d.vec3f(surfaceNormal);
  if (wetMask > 0) {
    film = wetMask * waterFilm(worldPos, sceneLayout.$.params.time);
    shadingNormal = waterNormal(surfaceNormal, worldPos, std.saturate(wetMask * 1.35));
  }

  const surface = Surface({
    normal: shadingNormal,
    viewDir,
    worldPos,
    albedo: std.mix(albedo, albedo * 0.44, film),
    f0: std.mix(std.mix(d.vec3f(0.04), albedo, metallic), d.vec3f(0.08), film * (1 - metallic)),
    roughness: std.clamp(std.mix(roughness, std.mix(0.065, 0.032, wetMask), film), 0.006, 1),
    metallic,
    specularBoost: 1 + film * 3.2,
  });

  return d.vec4f(tonemap(evaluateLighting(surface)), 1);
});

export const skyVertex = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, viewRay: d.vec3f },
})(({ vertexIndex }) => {
  'use gpu';
  const ndc = skyTriangleNdc.$[vertexIndex];
  const camera = sceneLayout.$.camera;
  const farView = camera.projectionInverse * d.vec4f(ndc, 1, 1);
  const farWorld = camera.viewInverse * d.vec4f(farView.xyz / farView.w, 1);
  return {
    pos: d.vec4f(ndc, 1, 1),
    viewRay: farWorld.xyz - camera.position.xyz,
  };
});

export const skyFragment = tgpu.fragmentFn({
  in: { viewRay: d.vec3f },
  out: d.vec4f,
})(({ viewRay }) => {
  'use gpu';
  return d.vec4f(tonemap(sampleSkyEnvironment(viewRay)), 1);
});

export const lightVertex = tgpu.vertexFn({
  in: { vid: d.builtin.vertexIndex, lightIdx: d.builtin.instanceIndex },
  out: { pos: d.builtin.position, color: d.vec3f },
})(({ vid, lightIdx }) => {
  'use gpu';
  const corner = lightQuadCorners.$[vid];
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

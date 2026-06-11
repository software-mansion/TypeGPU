import tgpu, { common, d, std } from 'typegpu';
import * as m from 'wgpu-matrix';
import { directionToEquirectUv, loadEnvironmentCubemap } from './cubemap.ts';
import { loadModel, ModelVertex } from './model.ts';
import { distributionGGX, fresnelSchlick, geometrySmith } from './pbr.ts';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const camera = root.createUniform(Camera);
const { cleanupCamera } = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(0, 0.5, 2, 1), minZoom: 0.5, maxZoom: 5 },
  (updates) => camera.patch(updates),
);

const linearSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});

const {
  texture: cubemapTexture,
  equirectTexture,
  mipLevelCount: envMipCount,
} = await loadEnvironmentCubemap(root, '/TypeGPU/assets/os-awards/environment.jpg');

const envLayout = tgpu.bindGroupLayout({
  cubemap: { texture: d.textureCube(d.f32) },
  equirect: { texture: d.texture2d(d.f32) },
  linearSampler: { sampler: 'filtering' },
  wrappingSampler: { sampler: 'filtering' },
});

const envBindGroup = root.createBindGroup(envLayout, {
  cubemap: cubemapTexture.createView(d.textureCube(d.f32)),
  equirect: equirectTexture.createView(d.texture2d(d.f32), {
    format: 'rgba8unorm-srgb',
  }),
  linearSampler,
  wrappingSampler: root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'repeat',
  }),
});

const displayExposure = 0.77;

const tonemapForDisplay = (color: d.v3f): d.v3f => {
  'use gpu';
  const exposed = color * displayExposure;
  const mapped = (exposed * (2.51 * exposed + 0.03)) / (exposed * (2.43 * exposed + 0.59) + 0.14);
  return std.pow(std.saturate(mapped), d.vec3f(1 / 2.2));
};

const envFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const ndc = d.vec4f(input.uv.x * 2 - 1, 1 - input.uv.y * 2, 1, 1);
  const viewPos = camera.$.projectionInverse * ndc;
  const viewDir = std.normalize(viewPos.xyz / viewPos.w);
  const worldDir = camera.$.viewInverse * d.vec4f(viewDir, 0);
  const uv = directionToEquirectUv(worldDir.xyz);
  const color = std.textureSampleBias(envLayout.$.equirect, envLayout.$.wrappingSampler, uv, 0).rgb;
  return d.vec4f(tonemapForDisplay(color), 1);
});

const envPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: envFragment,
});

const award = await loadModel(root, '/TypeGPU/assets/os-awards/award_cleanup.glb');
const awardVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertex));

const AwardMaterial = d.struct({
  baseColorFactor: d.vec4f,
  metallicFactor: d.f32,
  roughnessFactor: d.f32,
});

const awardMaterial = root.createUniform(AwardMaterial, {
  baseColorFactor: award.baseColorFactor,
  metallicFactor: award.metallicFactor,
  roughnessFactor: award.roughnessFactor,
});

const DirectLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
  strength: d.f32,
});

const awardLayout = tgpu.bindGroupLayout({
  baseColor: { texture: d.texture2d(d.f32) },
  metallicRoughness: { texture: d.texture2d(d.f32) },
  textureSampler: { sampler: 'filtering' },
});

const awardBindGroup = root.createBindGroup(awardLayout, {
  baseColor: award.baseColorTexture.createView(d.texture2d(d.f32), {
    format: 'rgba8unorm-srgb',
  }),
  metallicRoughness: award.metallicRoughnessTexture.createView(d.texture2d(d.f32)),
  textureSampler: linearSampler,
});

const awardTransform = root.createUniform(d.mat4x4f);
const awardOffset = d.vec3f(
  -(award.boundsMin.x + award.boundsMax.x) / 2,
  -(award.boundsMin.y + award.boundsMax.y) / 2,
  -(award.boundsMin.z + award.boundsMax.z) / 2,
);
const awardScale =
  1.2 /
  Math.max(
    award.boundsMax.x - award.boundsMin.x,
    award.boundsMax.y - award.boundsMin.y,
    award.boundsMax.z - award.boundsMin.z,
  );

const transformDraft = d.mat4x4f();
function updateAwardTransform(timeMs: number) {
  m.mat4.rotationY(timeMs * 0.0005, transformDraft);
  m.mat4.uniformScale(transformDraft, awardScale, transformDraft);
  m.mat4.translate(transformDraft, awardOffset, transformDraft);
  awardTransform.write(transformDraft);
}

const sceneLights = [
  { direction: d.vec3f(-0.78, 0.37, 0.5), color: d.vec3f(0.32, 0.52, 1), strength: 0.85 },
  { direction: d.vec3f(-0.04, 0.18, 0.98), color: d.vec3f(0.45, 0.56, 1), strength: 0.38 },
  { direction: d.vec3f(0.03, 0.78, 0.62), color: d.vec3f(1, 0.68, 0.24), strength: 1.25 },
  { direction: d.vec3f(0.39, 0.67, 0.63), color: d.vec3f(1, 0.76, 0.32), strength: 0.45 },
] as const;

const cameraFillColor = d.vec3f(1, 0.96, 0.9);
const cameraFillStrength = 0.4;

const ambientStrength = 0.3;
const warmVenueBounceColor = d.vec3f(1, 0.58, 0.36);
const warmVenueBounceStrength = 0.015;

const irradianceMipLevel = envMipCount - 2;
const maxSpecularMipLevel = envMipCount - 6;

const shadeOpaque = (
  albedo: d.v3f,
  roughness: number,
  metallic: number,
  normal: d.v3f,
  worldPos: d.v3f,
): d.v3f => {
  'use gpu';
  const materialRoughness = std.clamp(roughness, 0.04, 1);
  const materialMetallic = std.saturate(metallic);
  const viewDir = std.normalize(camera.$.position.xyz - worldPos);
  const NdotV = std.max(std.dot(normal, viewDir), 0);
  const F0 = std.mix(d.vec3f(0.04), albedo, materialMetallic);

  let direct = d.vec3f();
  for (const light of tgpu.unroll(sceneLights)) {
    direct += shadeDirectLight(
      albedo,
      materialRoughness,
      materialMetallic,
      F0,
      normal,
      viewDir,
      DirectLight(light),
    );
  }
  direct += shadeDirectLight(
    albedo,
    materialRoughness,
    materialMetallic,
    F0,
    normal,
    viewDir,
    DirectLight({
      direction: viewDir,
      color: cameraFillColor,
      strength: cameraFillStrength,
    }),
  );

  const ambientF = fresnelSchlick(NdotV, F0);
  const ambientKD = (1 - ambientF) * (1 - materialMetallic);
  const ambientDiffuseBRDF = (ambientKD * albedo) / Math.PI;
  const irradiance = std.textureSampleBias(
    envLayout.$.cubemap,
    envLayout.$.linearSampler,
    normal,
    irradianceMipLevel,
  ).rgb;
  const ambientDiffuse = irradiance * ambientDiffuseBRDF * ambientStrength;

  const reflected = std.reflect(std.neg(viewDir), normal);
  const reflection = std.textureSampleBias(
    envLayout.$.cubemap,
    envLayout.$.linearSampler,
    reflected,
    materialRoughness * materialRoughness * maxSpecularMipLevel,
  ).rgb;
  const ambientSpecular = reflection * fresnelSchlick(NdotV, F0) * ambientStrength;
  const warmVenueBounce =
    albedo * (1 - materialMetallic) * warmVenueBounceColor * warmVenueBounceStrength;

  return ambientDiffuse + ambientSpecular + warmVenueBounce + direct;
};

const shadeDirectLight = (
  albedo: d.v3f,
  materialRoughness: number,
  materialMetallic: number,
  F0: d.v3f,
  normal: d.v3f,
  viewDir: d.v3f,
  light: d.Infer<typeof DirectLight>,
): d.v3f => {
  'use gpu';
  const lightDirection = std.normalize(light.direction);
  const halfDir = std.normalize(viewDir + lightDirection);

  const NdotL = std.max(std.dot(normal, lightDirection), 0);
  const NdotV = std.max(std.dot(normal, viewDir), 0);
  const NdotH = std.max(std.dot(normal, halfDir), 0);
  const HdotV = std.max(std.dot(halfDir, viewDir), 0);

  const F = fresnelSchlick(HdotV, F0);
  const D = distributionGGX(NdotH, materialRoughness);
  const G = geometrySmith(NdotV, NdotL, materialRoughness);

  const kD = (1 - F) * (1 - materialMetallic);
  const diffuse = (kD * albedo) / Math.PI;
  const specular = (F * D * G) / std.max(4 * NdotV * NdotL, 0.001);
  return (diffuse + specular) * light.color * (NdotL * light.strength);
};

// Hard-coded model-space epoxy fill bounds.
const epoxyBoundsMin = d.vec3f(-0.02, -0.16, -0.17);
const epoxyBoundsMax = d.vec3f(0.02, 0.28, 0.17);

const epoxyWarpFrequency = 34;
const epoxyWarpStrength = 0.22;

const epoxyTint = d.vec3f(0.9, 0.98, 1.05);
const epoxyAlbedoMix = 0.08;

const isInEpoxyRegion = (modelPos: d.v3f): boolean => {
  'use gpu';
  return std.all(std.ge(modelPos, epoxyBoundsMin)) && std.all(std.le(modelPos, epoxyBoundsMax));
};

const shadeEpoxy = (modelPos: d.v3f, worldPos: d.v3f, normal: d.v3f, albedo: d.v3f): d.v3f => {
  'use gpu';
  const p = modelPos * epoxyWarpFrequency;
  const warp = d.vec3f(
    std.sin(p.y + p.z * 0.37),
    std.sin(p.z * 1.31 + p.x),
    std.sin(p.x * 0.73 - p.y * 1.19),
  );
  const secondaryWarp = d.vec3f(
    std.sin(p.x * 2.1 + p.y * 0.4),
    std.sin(p.y * 1.7 - p.z * 0.9),
    std.sin(p.z * 1.4 + p.x * 0.6),
  );
  const distortedNormal = std.normalize(normal + warp * 0.18 + secondaryWarp * 0.07);
  const viewDir = std.normalize(worldPos - camera.$.position.xyz);
  const reflected = std.reflect(viewDir, distortedNormal);
  const throughDir = std.normalize(d.vec3f(viewDir.x, -viewDir.y, viewDir.z) + warp * 0.12);
  const mirrorDir = std.normalize(d.vec3f(reflected.x, -reflected.y, reflected.z) + warp * 0.2);
  const smearDir = std.normalize(
    std.mix(throughDir, d.vec3f(-mirrorDir.z, mirrorDir.y, mirrorDir.x), 0.35) +
      secondaryWarp * epoxyWarpStrength,
  );

  const transmitted = std.textureSampleBias(
    envLayout.$.cubemap,
    envLayout.$.linearSampler,
    throughDir,
    0.45,
  ).rgb;
  const mirrored = std.textureSampleBias(
    envLayout.$.cubemap,
    envLayout.$.linearSampler,
    mirrorDir,
    1.2,
  ).rgb;
  const smeared = std.textureSampleBias(
    envLayout.$.cubemap,
    envLayout.$.linearSampler,
    smearDir,
    2.2,
  ).rgb;

  const rim = std.pow(std.saturate(1 - std.abs(std.dot(normal, viewDir))), 4);
  const sceneThrough =
    (transmitted * 0.62 + mirrored * 0.28 + smeared * 0.1) * epoxyTint +
    d.vec3f(0.45, 0.65, 0.9) * rim * 0.18;
  const woodGrain = std.sin(modelPos.z * 95 + modelPos.y * 48 + warp.x * 1.4) * 0.5 + 0.5;
  const lowerWoodMask = std.saturate(1 - std.smoothstep(-0.145, -0.13, modelPos.y));
  const disturbedWood =
    std.mix(albedo * d.vec3f(0.95, 0.72, 0.48), d.vec3f(0.28, 0.13, 0.045), 0.72) *
    (0.84 + woodGrain * 0.24);
  const epoxyBody = std.mix(sceneThrough, albedo, epoxyAlbedoMix);
  return std.mix(epoxyBody, disturbedWood, lowerWoodMask * 0.65);
};

const awardVertex = tgpu.vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, uv: d.vec2f },
  out: {
    pos: d.builtin.position,
    normal: d.vec3f,
    uv: d.vec2f,
    modelPos: d.vec3f,
    worldPos: d.vec3f,
  },
})((input) => {
  'use gpu';
  const worldPos = awardTransform.$ * d.vec4f(input.position, 1);
  return {
    pos: camera.$.projection * (camera.$.view * worldPos),
    normal: (awardTransform.$ * d.vec4f(input.normal, 0)).xyz,
    uv: input.uv,
    modelPos: input.position,
    worldPos: worldPos.xyz,
  };
});

const awardFragment = tgpu.fragmentFn({
  in: {
    normal: d.vec3f,
    uv: d.vec2f,
    modelPos: d.vec3f,
    worldPos: d.vec3f,
    frontFacing: d.builtin.frontFacing,
  },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const normal = std.normalize(std.select(std.neg(input.normal), input.normal, input.frontFacing));
  const albedo =
    std.textureSample(awardLayout.$.baseColor, awardLayout.$.textureSampler, input.uv).rgb *
    awardMaterial.$.baseColorFactor.rgb;
  const metallicRoughness = std.textureSample(
    awardLayout.$.metallicRoughness,
    awardLayout.$.textureSampler,
    input.uv,
  );
  const roughness = metallicRoughness.g * awardMaterial.$.roughnessFactor;
  const metallic = metallicRoughness.b * awardMaterial.$.metallicFactor;
  const opaqueColor = shadeOpaque(albedo, roughness, metallic, normal, input.worldPos);

  // Texture samples must stay in uniform control flow, so both looks are
  // computed unconditionally and selected per fragment afterwards.
  const epoxyColor = shadeEpoxy(input.modelPos, input.worldPos, normal, albedo);
  const isEpoxy = isInEpoxyRegion(input.modelPos);
  const color = std.select(opaqueColor, epoxyColor, isEpoxy);
  return d.vec4f(tonemapForDisplay(color), 1);
});

const awardPipeline = root.createRenderPipeline({
  attribs: awardVertexLayout.attrib,
  vertex: awardVertex,
  fragment: awardFragment,
  primitive: { cullMode: 'none' },
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
});

function createDepthTexture() {
  const texture = root.device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  return { texture, view: texture.createView() };
}

let depth = createDepthTexture();
const resizeObserver = new ResizeObserver(() => {
  depth.texture.destroy();
  depth = createDepthTexture();
});
resizeObserver.observe(canvas);

let exampleDestroyed = false;

function frame(timeMs: number) {
  if (exampleDestroyed) {
    return;
  }
  updateAwardTransform(timeMs);

  envPipeline.withColorAttachment({ view: context }).with(envBindGroup).draw(3);

  awardPipeline
    .withColorAttachment({ view: context, loadOp: 'load' })
    .withDepthStencilAttachment({
      view: depth.view,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(awardVertexLayout, award.vertexBuffer)
    .withIndexBuffer(award.indexBuffer)
    .with(envBindGroup)
    .with(awardBindGroup)
    .drawIndexed(award.indexCount);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export function onCleanup() {
  exampleDestroyed = true;
  cleanupCamera();
  resizeObserver.unobserve(canvas);
  root.destroy();
}

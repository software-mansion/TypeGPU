import tgpu, { common, d, std } from 'typegpu';
import * as m from 'wgpu-matrix';
import { directionToEquirectUv, loadEnvironmentCubemap } from './cubemap.ts';
import { loadModel, ModelVertex } from './model.ts';
import { distributionGGX, fresnelSchlick, geometrySmith } from './pbr.ts';
import { scene } from './scene.ts';
import { defineControls } from '../../common/defineControls.ts';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';

const AwardMaterial = d.struct({
  baseColorFactor: d.vec4f,
  metallicFactor: d.f32,
  roughnessFactor: d.f32,
});

const DirectLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
  strength: d.f32,
});

const PbrSurface = d.struct({
  albedo: d.vec3f,
  roughness: d.f32,
  metallic: d.f32,
  normal: d.vec3f,
  viewDir: d.vec3f,
  f0: d.vec3f,
  nDotV: d.f32,
});

const EpoxyEnvironmentSample = d.struct({
  weight: d.f32,
  bias: d.f32,
});

const awardVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertex));

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const camera = root.createUniform(Camera);
const { cleanupCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: scene.camera.awayFromStagePosition,
    target: scene.camera.target,
    minZoom: scene.camera.minZoom,
    maxZoom: scene.camera.maxZoom,
  },
  (updates) => camera.patch(updates),
);

const linearSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});

const { texture: cubemapTexture, equirectTexture } = await loadEnvironmentCubemap(
  root,
  '/TypeGPU/assets/os-awards/environment.jpg',
);
const award = await loadModel(root, '/TypeGPU/assets/os-awards/award_cleanup.glb');

const envResources = {
  cubemap: cubemapTexture.createView(d.textureCube(d.f32)),
  equirect: equirectTexture.createView(d.texture2d(d.f32), { format: 'rgba8unorm-srgb' }),
  linearSampler,
};

const awardResources = {
  baseColor: award.baseColorTexture.createView(d.texture2d(d.f32), { format: 'rgba8unorm-srgb' }),
  metallicRoughness: award.metallicRoughnessTexture.createView(d.texture2d(d.f32)),
  textureSampler: linearSampler,
};

const awardMaterial = root.createUniform(AwardMaterial, {
  baseColorFactor: award.baseColorFactor,
  metallicFactor: award.metallicFactor,
  roughnessFactor: award.roughnessFactor,
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
let autoRotateAward = true;
let awardRotation = scene.award.initialRotation;
let lastFrameTimeMs: number | undefined;

function updateAwardTransform(timeMs: number) {
  const deltaTimeMs = lastFrameTimeMs === undefined ? 0 : Math.max(0, timeMs - lastFrameTimeMs);
  lastFrameTimeMs = timeMs;
  if (autoRotateAward) {
    awardRotation += deltaTimeMs * scene.award.autoRotationSpeed;
  }

  m.mat4.rotationY(awardRotation, transformDraft);
  m.mat4.uniformScale(transformDraft, awardScale, transformDraft);
  m.mat4.translate(transformDraft, awardOffset, transformDraft);
  awardTransform.write(transformDraft);
}

const tonemapForDisplay = (color: d.v3f): d.v3f => {
  'use gpu';
  const exposed = color * scene.display.exposure;
  const mapped = (exposed * (2.51 * exposed + 0.03)) / (exposed * (2.43 * exposed + 0.59) + 0.14);
  return std.pow(std.saturate(mapped), scene.display.gamma);
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

const shadeDirectLights = (surface: d.InferGPU<typeof PbrSurface>): d.v3f => {
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
  const irradiance = std.textureSampleBias(
    envResources.cubemap.$,
    envResources.linearSampler.$,
    surface.normal,
    scene.environment.irradianceMipBias,
  ).rgb;
  const ambientDiffuse = irradiance * ambientDiffuseBRDF * scene.lighting.ambientStrength;

  const reflected = std.reflect(std.neg(surface.viewDir), surface.normal);
  const reflection = std.textureSampleBias(
    envResources.cubemap.$,
    envResources.linearSampler.$,
    reflected,
    surface.roughness * surface.roughness * scene.environment.maxSpecularMipBias,
  ).rgb;
  const ambientSpecular =
    reflection * fresnelSchlick(surface.nDotV, surface.f0) * scene.lighting.ambientStrength;
  const warmVenueBounce =
    surface.albedo *
    (1 - surface.metallic) *
    scene.lighting.venueBounce.color *
    scene.lighting.venueBounce.strength;

  return ambientDiffuse + ambientSpecular + warmVenueBounce + direct;
};

const isInEpoxyRegion = (modelPos: d.v3f): boolean => {
  'use gpu';
  return (
    std.all(std.ge(modelPos, scene.epoxy.bounds.min)) &&
    std.all(std.le(modelPos, scene.epoxy.bounds.max))
  );
};

const shadeEpoxy = (modelPos: d.v3f, worldPos: d.v3f, normal: d.v3f, albedo: d.v3f): d.v3f => {
  'use gpu';
  const p = modelPos * scene.epoxy.warp.frequency;
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
      secondaryWarp * scene.epoxy.warp.strength,
  );

  const environmentSampleDirs = d.arrayOf(
    d.vec3f,
    scene.epoxy.environmentSamples.length,
  )([throughDir, mirrorDir, smearDir]);
  let environmentColor = d.vec3f();
  for (const i of tgpu.unroll(std.range(scene.epoxy.environmentSamples.length))) {
    const sample = EpoxyEnvironmentSample(scene.epoxy.environmentSamples[i]);
    environmentColor +=
      std.textureSampleBias(
        envResources.cubemap.$,
        envResources.linearSampler.$,
        environmentSampleDirs[i],
        sample.bias,
      ).rgb * sample.weight;
  }

  const rim = std.pow(std.saturate(1 - std.abs(std.dot(normal, viewDir))), 4);
  const sceneThrough = environmentColor * scene.epoxy.tint + scene.epoxy.rimColor * rim * 0.18;
  const woodGrain = std.sin(modelPos.z * 95 + modelPos.y * 48 + warp.x * 1.4) * 0.5 + 0.5;
  const lowerWoodMask = std.saturate(1 - std.smoothstep(-0.145, -0.13, modelPos.y));
  const disturbedWood =
    std.mix(albedo * scene.epoxy.wood.warm, scene.epoxy.wood.dark, 0.72) *
    (0.84 + woodGrain * 0.24);
  const epoxyBody = std.mix(sceneThrough, albedo, scene.epoxy.albedoMix);
  return std.mix(epoxyBody, disturbedWood, lowerWoodMask * 0.65);
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
  const color = std.textureSampleBias(
    envResources.equirect.$,
    envResources.linearSampler.$,
    uv,
    0,
  ).rgb;
  return d.vec4f(tonemapForDisplay(color), 1);
});

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
    std.textureSample(awardResources.baseColor.$, awardResources.textureSampler.$, input.uv).rgb *
    awardMaterial.$.baseColorFactor.rgb;
  const metallicRoughness = std.textureSample(
    awardResources.metallicRoughness.$,
    awardResources.textureSampler.$,
    input.uv,
  );
  const roughness = metallicRoughness.g * awardMaterial.$.roughnessFactor;
  const metallic = metallicRoughness.b * awardMaterial.$.metallicFactor;
  const opaqueColor = shadeOpaque(albedo, roughness, metallic, normal, input.worldPos);

  const epoxyColor = shadeEpoxy(input.modelPos, input.worldPos, normal, albedo);
  const isEpoxy = isInEpoxyRegion(input.modelPos);
  const color = std.select(opaqueColor, epoxyColor, isEpoxy);
  return d.vec4f(tonemapForDisplay(color), 1);
});

const envPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: envFragment,
});

const awardPipeline = root.createRenderPipeline({
  attribs: awardVertexLayout.attrib,
  vertex: awardVertex,
  fragment: awardFragment,
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

  envPipeline.withColorAttachment({ view: context }).draw(3);

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
    .drawIndexed(award.indexCount);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export const controls = defineControls({
  'Auto-rotate model': {
    initial: autoRotateAward,
    onToggleChange(value) {
      autoRotateAward = value;
    },
  },
});

export function onCleanup() {
  exampleDestroyed = true;
  cleanupCamera();
  resizeObserver.unobserve(canvas);
  root.destroy();
}

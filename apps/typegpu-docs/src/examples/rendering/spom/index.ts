import tgpu, { d, std, type RenderFlag, type TgpuTexture } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import {
  distributionGGX,
  faceEdgeMask,
  fresnelSchlick,
  geometrySmith,
  intersectUvDepthBox,
  isOutOfBounds,
  shapeSurfaceDepth,
  toTangentSpace,
  uvRayPerDepth,
} from './shaders.ts';
import {
  DEFAULT_PARALLAX_STEPS,
  INITIAL_SUN_ANGLE,
  INITIAL_SUN_HEIGHT,
  MATERIAL_LAYER,
  MAX_PARALLAX_STEPS,
  SCENE_MATERIAL_IDS,
  SCENE_TEXTURE_LAYER_COUNT,
  SpomParams,
  computeLightDir,
  spomInstanceLayout,
  spomInstances,
  spomIndices,
  spomVertexLayout,
  spomVertices,
} from './types.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const spomMesh = {
  vertexBuffer: root
    .createBuffer(spomVertexLayout.schemaForCount(spomVertices.length), spomVertices)
    .$usage('vertex'),
  instanceBuffer: root
    .createBuffer(spomInstanceLayout.schemaForCount(spomInstances.length), spomInstances)
    .$usage('vertex'),
  indexBuffer: root.createBuffer(d.arrayOf(d.u16, spomIndices.length), spomIndices).$usage('index'),
  indexCount: spomIndices.length,
  instanceCount: spomInstances.length,
};

async function loadImage(src: string) {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to load texture: ${src}`);
  }
  return createImageBitmap(await response.blob());
}

const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
  addressModeU: 'repeat',
  addressModeV: 'repeat',
  maxAnisotropy: 4,
});

const pbrTexture = root
  .createTexture({
    size: [1024, 1024, SCENE_TEXTURE_LAYER_COUNT],
    format: 'rgba8unorm',
    viewFormats: ['rgba8unorm-srgb'],
    mipLevelCount: 6,
  })
  .$usage('sampled', 'render');

const albedoView = pbrTexture.createView(d.texture2dArray(d.f32), {
  format: 'rgba8unorm-srgb',
  baseArrayLayer: 0,
  arrayLayerCount: SCENE_TEXTURE_LAYER_COUNT,
});
const materialView = pbrTexture.createView(d.texture2dArray(d.f32), {
  baseArrayLayer: 0,
  arrayLayerCount: SCENE_TEXTURE_LAYER_COUNT,
});

async function loadMaterialImages(materialId: (typeof SCENE_MATERIAL_IDS)[number]) {
  const basePath = `/TypeGPU/assets/pom/${materialId}`;
  return Promise.all([
    loadImage(`${basePath}/albedo.png`),
    loadImage(`${basePath}/normal.png`),
    loadImage(`${basePath}/height.png`),
    loadImage(`${basePath}/ao.png`),
    loadImage(`${basePath}/roughness.png`),
    loadImage(`${basePath}/metallic.png`),
  ]);
}

function disposeImages(images: ImageBitmap[]) {
  for (const image of images) {
    image.close();
  }
}

function applyImages(images: ImageBitmap[]) {
  pbrTexture.write(images);
  pbrTexture.generateMipmaps();
  disposeImages(images);
}

let materialLoadRequestId = 0;

async function loadSceneMaterials() {
  const requestId = ++materialLoadRequestId;
  const imageGroups = await Promise.all(SCENE_MATERIAL_IDS.map(loadMaterialImages));
  if (requestId !== materialLoadRequestId) {
    for (const images of imageGroups) {
      disposeImages(images);
    }
    return;
  }
  applyImages(imageGroups.flat());
}

await loadSceneMaterials();

const cameraUniform = root.createUniform(Camera);
let sunAngle = INITIAL_SUN_ANGLE;
let sunHeight = INITIAL_SUN_HEIGHT;

const spomParams = root.createUniform(SpomParams, {
  reliefScale: 1,
  tiling: 1,
  lightDir: computeLightDir(sunAngle, sunHeight),
  parallaxSteps: DEFAULT_PARALLAX_STEPS,
});

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(2.2, 1.25, 2.2, 1), target: d.vec4f(0, 0, 0, 1), minZoom: 0.8, maxZoom: 10 },
  (updates) => cameraUniform.patch(updates),
);

function sampleHeightDepth(
  uv: d.v2f,
  tiling: number,
  materialBase: number,
  ddx: d.v2f,
  ddy: d.v2f,
) {
  'use gpu';
  const rawDepth =
    1 -
    std.textureSampleGrad(
      materialView.$,
      sampler.$,
      uv,
      materialBase + MATERIAL_LAYER.height,
      ddx,
      ddy,
    ).r;
  return shapeSurfaceDepth(rawDepth, materialBase, uv.div(tiling));
}

const vertexFn = tgpu.vertexFn({
  in: {
    uv: d.vec2f,
    volumeDepth: d.f32,
    origin: d.vec3f,
    size: d.vec2f,
    tangent: d.vec3f,
    bitangent: d.vec3f,
    normal: d.vec3f,
    heightScale: d.f32,
    uvTiling: d.f32,
    materialBase: d.u32,
  },
  out: {
    pos: d.builtin.position,
    uv: d.vec2f,
    volumeDepth: d.f32,
    worldPos: d.vec3f,
    origin: d.vec3f,
    size: d.vec2f,
    heightScale: d.f32,
    uvTiling: d.f32,
    materialBase: d.interpolate('flat', d.u32),
    T: d.vec3f,
    B: d.vec3f,
    N: d.vec3f,
  },
})(({
  uv,
  volumeDepth,
  origin,
  size,
  tangent,
  bitangent,
  normal,
  heightScale,
  uvTiling,
  materialBase,
}) => {
  'use gpu';
  const camera = cameraUniform.$;
  const params = spomParams.$;

  const N = normal;
  const T = tangent;
  const B = bitangent;

  const height = heightScale * params.reliefScale;
  const local = std.sub(uv.mul(2), 1).mul(size);
  const footprintPos = origin.add(T.mul(local.x)).add(B.mul(local.y));
  const hullMask = std.select(faceEdgeMask(uv), d.f32(1), materialBase === 0);
  const hullDepth = 1 - (1 - volumeDepth) * hullMask;
  const worldPos = footprintPos.add(N.mul((1 - hullDepth) * height));
  const clipPos = camera.projection.mul(camera.view).mul(d.vec4f(worldPos, 1));

  return {
    pos: clipPos,
    uv,
    volumeDepth: hullDepth,
    worldPos,
    origin,
    size,
    heightScale,
    uvTiling,
    materialBase,
    T,
    B,
    N,
  };
});

const fragmentFn = tgpu.fragmentFn({
  in: {
    uv: d.vec2f,
    volumeDepth: d.f32,
    worldPos: d.vec3f,
    origin: d.vec3f,
    size: d.vec2f,
    heightScale: d.f32,
    uvTiling: d.f32,
    materialBase: d.interpolate('flat', d.u32),
    T: d.vec3f,
    B: d.vec3f,
    N: d.vec3f,
  },
  out: {
    color: d.vec4f,
    depth: d.builtin.fragDepth,
  },
})(({ uv, volumeDepth, worldPos, origin, size, heightScale, uvTiling, materialBase, T, B, N }) => {
  'use gpu';

  const camera = cameraUniform.$;
  const params = spomParams.$;
  const height = heightScale * params.reliefScale;
  const tiling = uvTiling * params.tiling;

  const lightDir = params.lightDir;
  const viewDir = std.normalize(std.sub(camera.position.xyz, worldPos));
  const viewDirTS = toTangentSpace(viewDir, T, B, N);
  const lightDirTS = toTangentSpace(lightDir, T, B, N);

  const jitter = d.f32(0.5);

  const startUv = uv.mul(tiling);
  const spomDdx = std.dpdx(startUv);
  const spomDdy = std.dpdy(startUv);

  const stepCount = std.max(params.parallaxSteps, 1);
  const stepCountF = d.f32(stepCount);
  const layerDepth = 1 / stepCountF;

  const startDepth = volumeDepth;
  const uvPerDepth = uvRayPerDepth(viewDirTS, height, tiling, size).mul(-1);
  const interval = intersectUvDepthBox(startUv, uvPerDepth, tiling, 1 - startDepth);

  if (interval.x > interval.y) {
    std.discard();
  }

  let depthDelta = std.min(interval.y, interval.x + layerDepth * jitter);
  let depth = startDepth + depthDelta;
  let marchUv = startUv.add(uvPerDepth.mul(depthDelta));
  let surfaceDepth = sampleHeightDepth(marchUv, tiling, materialBase, spomDdx, spomDdy);

  let prevUv = d.vec2f(marchUv);
  let prevDepth = depth;
  let prevSurfaceDepth = surfaceDepth;
  let hit = depth >= surfaceDepth;

  for (let i = d.u32(0); i < MAX_PARALLAX_STEPS; i++) {
    if (hit || i >= stepCount || depthDelta >= interval.y) {
      break;
    }

    prevUv = d.vec2f(marchUv);
    prevDepth = depth;
    prevSurfaceDepth = surfaceDepth;

    depthDelta = std.min(interval.y, depthDelta + layerDepth);
    depth = startDepth + depthDelta;
    marchUv = startUv.add(uvPerDepth.mul(depthDelta));
    surfaceDepth = sampleHeightDepth(marchUv, tiling, materialBase, spomDdx, spomDdy);

    if (depth >= surfaceDepth) {
      hit = true;
      break;
    }
  }

  if (!hit) {
    std.discard();
  }

  const prevGap = prevSurfaceDepth - prevDepth;
  const currGap = surfaceDepth - depth;
  const hitT = std.saturate(prevGap / std.max(prevGap - currGap, 0.00001));
  const sampleUv = std.mix(prevUv, marchUv, hitT);
  const sampleDepth = std.mix(prevDepth, depth, hitT);
  const hitUv01 = sampleUv.div(tiling);
  const reliefMask = std.select(faceEdgeMask(hitUv01), d.f32(1), materialBase === 0);
  const depthForWorld = std.mix(1, sampleDepth, reliefMask);

  const albedo = std.textureSampleGrad(
    albedoView.$,
    sampler.$,
    sampleUv,
    materialBase + MATERIAL_LAYER.albedo,
    spomDdx,
    spomDdy,
  ).rgb;
  const rawN = std.textureSampleGrad(
    materialView.$,
    sampler.$,
    sampleUv,
    materialBase + MATERIAL_LAYER.normal,
    spomDdx,
    spomDdy,
  ).xyz;
  const ao = std.textureSampleGrad(
    materialView.$,
    sampler.$,
    sampleUv,
    materialBase + MATERIAL_LAYER.ao,
    spomDdx,
    spomDdy,
  ).r;
  const roughness = std.textureSampleGrad(
    materialView.$,
    sampler.$,
    sampleUv,
    materialBase + MATERIAL_LAYER.roughness,
    spomDdx,
    spomDdy,
  ).r;
  const metallic = std.textureSampleGrad(
    materialView.$,
    sampler.$,
    sampleUv,
    materialBase + MATERIAL_LAYER.metallic,
    spomDdx,
    spomDdy,
  ).r;

  const decoded = std.sub(rawN.mul(2), 1);
  const tsNormal = std.normalize(
    d.vec3f(decoded.xy.mul(d.vec2f(1, -1)).mul(reliefMask), std.mix(1, decoded.z, reliefMask)),
  );
  const worldNormal = std.normalize(
    T.mul(tsNormal.x).add(B.mul(tsNormal.y)).add(N.mul(tsNormal.z)),
  );

  let shadowFactor = d.f32(1);

  if (height > 0.00001 && lightDirTS.z > 0) {
    const shadowUvStep = uvRayPerDepth(lightDirTS, height, tiling, size).div(stepCountF);
    const softShadowMultiplier = d.f32(16);
    let shadowUv = d.vec2f(sampleUv.add(shadowUvStep.mul(jitter)));
    let shadowDepth = sampleDepth - layerDepth * jitter;
    let marchedDepth = layerDepth * jitter;

    for (let i = d.u32(0); i < MAX_PARALLAX_STEPS; i++) {
      if (i >= stepCount) {
        break;
      }

      shadowUv = shadowUv.add(shadowUvStep);
      shadowDepth = shadowDepth - layerDepth;
      marchedDepth = marchedDepth + layerDepth;

      if (isOutOfBounds(shadowUv, tiling) || shadowDepth <= 0) {
        break;
      }

      const currentHeight = sampleHeightDepth(shadowUv, tiling, materialBase, spomDdx, spomDdy);
      if (shadowDepth >= currentHeight) {
        shadowFactor = 0;
        break;
      }

      const gap = currentHeight - shadowDepth;
      shadowFactor = std.min(shadowFactor, (softShadowMultiplier * gap) / marchedDepth);
    }

    shadowFactor = std.saturate(shadowFactor);
  }
  shadowFactor = std.mix(1, shadowFactor, reliefMask);

  const H = std.normalize(viewDir.add(lightDir));

  const NdotL = std.max(0, std.dot(worldNormal, lightDir));
  const NdotV = std.max(0, std.dot(worldNormal, viewDir));
  const NdotH = std.max(0, std.dot(worldNormal, H));
  const HdotV = std.max(0, std.dot(H, viewDir));

  const F0 = std.mix(d.vec3f(0.04), albedo, metallic);

  const D = distributionGGX(NdotH, roughness);
  const G = geometrySmith(NdotV, NdotL, roughness);
  const F = fresnelSchlick(HdotV, F0);

  const kD = std.sub(1, F).mul(1 - metallic);
  const diffuse = std.div(kD.mul(albedo), Math.PI);
  const specular = std.div(F.mul(D).mul(G), std.max(4 * NdotV * NdotL, 0.001));

  let shaded = d
    .vec3f(0.03)
    .mul(albedo)
    .mul(ao)
    .add(diffuse.add(specular).mul(NdotL).mul(shadowFactor));

  shaded = std.div(shaded, shaded.add(1));
  shaded = std.pow(shaded, d.vec3f(1 / 3.2));

  const hitLocal = std.sub(hitUv01.mul(2), 1).mul(size);
  const hitFootprintPos = origin.add(T.mul(hitLocal.x)).add(B.mul(hitLocal.y));
  const hitWorldPos = hitFootprintPos.add(N.mul((1 - depthForWorld) * height));
  const hitClipPos = camera.projection.mul(camera.view).mul(d.vec4f(hitWorldPos, 1));

  return {
    color: d.vec4f(shaded, 1),
    depth: hitClipPos.z / hitClipPos.w,
  };
});

const pipeline = root
  .createRenderPipeline({
    attribs: { ...spomVertexLayout.attrib, ...spomInstanceLayout.attrib },
    vertex: vertexFn,
    fragment: fragmentFn,
    targets: { color: { format: presentationFormat } },
    primitive: {
      cullMode: 'back',
    },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  })
  .with(spomVertexLayout, spomMesh.vertexBuffer)
  .with(spomInstanceLayout, spomMesh.instanceBuffer)
  .withIndexBuffer(spomMesh.indexBuffer);

let depthTexture: TgpuTexture<{
  size: [number, number];
  format: 'depth32float';
}> &
  RenderFlag;

function createDepthTexture() {
  depthTexture?.destroy();
  depthTexture = root
    .createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth32float',
    })
    .$usage('render');
}
createDepthTexture();

let frameId: number;
function frame() {
  pipeline
    .withColorAttachment({
      color: { view: context, clearValue: [0.48, 0.54, 0.6, 1] },
    })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .drawIndexed(spomMesh.indexCount, spomMesh.instanceCount);
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = defineControls({
  tiling: {
    initial: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    onSliderChange(v) {
      spomParams.patch({ tiling: v });
    },
  },
  'relief scale': {
    initial: 1,
    min: 0.2,
    max: 1.8,
    step: 0.05,
    onSliderChange(v) {
      spomParams.patch({ reliefScale: v });
    },
  },
  'parallax steps': {
    initial: DEFAULT_PARALLAX_STEPS,
    min: 4,
    max: MAX_PARALLAX_STEPS,
    step: 1,
    onSliderChange(v) {
      spomParams.patch({ parallaxSteps: Math.round(v) });
    },
  },
  'sun height': {
    initial: INITIAL_SUN_HEIGHT,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange(v) {
      sunHeight = v;
      spomParams.patch({ lightDir: computeLightDir(sunAngle, sunHeight) });
    },
  },
  'sun angle': {
    initial: Math.round((INITIAL_SUN_ANGLE * 180) / Math.PI),
    min: 0,
    max: 360,
    step: 1,
    onSliderChange(v) {
      sunAngle = (v * Math.PI) / 180;
      spomParams.patch({ lightDir: computeLightDir(sunAngle, sunHeight) });
    },
  },
});

const resizeObserver = new ResizeObserver(createDepthTexture);
resizeObserver.observe(canvas);

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  resizeObserver.unobserve(canvas);
  depthTexture.destroy();
  root.destroy();
}

// #endregion

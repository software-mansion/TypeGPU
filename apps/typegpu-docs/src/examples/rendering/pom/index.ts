import { randf } from '@typegpu/noise';
import tgpu, { d, std, type RenderFlag, type TgpuTexture } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import {
  distributionGGX,
  fresnelSchlick,
  geometrySmith,
  isOutOfBounds,
  pomUvStep,
  toTangentSpace,
} from './shaders.ts';
import {
  DEFAULT_MATERIAL,
  DEFAULT_PARALLAX_STEPS,
  INITIAL_SUN_ANGLE,
  INITIAL_SUN_HEIGHT,
  MATERIAL_IDS,
  MATERIAL_LAYER,
  MAX_PARALLAX_STEPS,
  PomParams,
  computeLightDir,
  planeConstants,
  planeIndices,
  planeVertices,
  vertexLayout,
} from './types.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const planeMesh = {
  vertexBuffer: root
    .createBuffer(vertexLayout.schemaForCount(planeVertices.length), planeVertices)
    .$usage('vertex'),
  indexBuffer: root
    .createBuffer(d.arrayOf(d.u16, planeIndices.length), planeIndices)
    .$usage('index'),
  indexCount: planeIndices.length,
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
    size: [1024, 1024, 6],
    format: 'rgba8unorm',
    viewFormats: ['rgba8unorm-srgb'],
    mipLevelCount: 6,
  })
  .$usage('sampled', 'render');

const albedoView = pbrTexture.createView(d.texture2d(d.f32), {
  format: 'rgba8unorm-srgb',
  baseArrayLayer: 0,
  arrayLayerCount: 1,
});
const nharmView = pbrTexture.createView(d.texture2dArray(d.f32), {
  baseArrayLayer: 1,
  arrayLayerCount: 5,
});

async function loadMaterialImages(materialId: (typeof MATERIAL_IDS)[number]) {
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

async function setMaterial(materialId: (typeof MATERIAL_IDS)[number]) {
  const requestId = ++materialLoadRequestId;
  const images = await loadMaterialImages(materialId);
  if (requestId !== materialLoadRequestId) {
    disposeImages(images);
    return;
  }
  applyImages(images);
}

async function loadCustomMaterial() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/*';

  const files: FileList = await new Promise((resolve) => {
    input.onchange = () => resolve(input.files as FileList);
    input.click();
  });

  const slots = ['albedo', 'normal', 'height', 'ao', 'roughness', 'metallic'] as const;
  type Slot = (typeof slots)[number];

  const slotAliases: Record<Slot, string[]> = {
    albedo: ['basecolor', 'base_color', 'diffuse', 'albedo', 'color', 'diff', 'alb', 'col'],
    normal: ['normal', 'norm', 'nor', 'nrm'],
    height: ['displacement', 'height', 'bump', 'disp', 'hgt'],
    ao: ['ambient_occlusion', 'occlusion', 'ao', 'occ'],
    roughness: ['roughness', 'rough', 'rgh'],
    metallic: ['metallic', 'metal', 'met', 'mtl'],
  };

  const fileMap: Partial<Record<Slot, File>> = {};

  for (const file of Array.from(files)) {
    const lower = file.name.toLowerCase();
    for (const slot of slots) {
      if (slotAliases[slot].some((alias) => lower.includes(alias))) {
        if (fileMap[slot]) {
          console.warn(
            `Multiple files match slot "${slot}": keeping "${fileMap[slot].name}", ignoring "${file.name}"`,
          );
        } else {
          fileMap[slot] = file;
        }
        break;
      }
    }
  }

  const slotFallbacks: Record<Slot, [number, number, number, number]> = {
    albedo: [255, 255, 255, 255], // white
    normal: [128, 128, 255, 255], // flat tangent-space normal
    height: [128, 128, 128, 255], // mid height → no displacement
    ao: [255, 255, 255, 255], // fully unoccluded
    roughness: [128, 128, 128, 255], // mid roughness
    metallic: [0, 0, 0, 255], // non-metallic
  };

  const missing = slots.filter((slot) => !fileMap[slot]);
  if (missing.length > 0) {
    console.warn(`Custom material missing slots (using fallbacks): ${missing.join(', ')}`);
  }

  const images = await Promise.all(
    slots.map((slot) => {
      if (fileMap[slot]) {
        return createImageBitmap(fileMap[slot] as File);
      }
      const [r, g, b, a] = slotFallbacks[slot];
      return createImageBitmap(new ImageData(new Uint8ClampedArray([r, g, b, a]), 1, 1));
    }),
  );
  applyImages(images);
}

await setMaterial(DEFAULT_MATERIAL);

const cameraUniform = root.createUniform(Camera);
let sunAngle = INITIAL_SUN_ANGLE;
let sunHeight = INITIAL_SUN_HEIGHT;

const pomParams = root.createUniform(PomParams, {
  heightScale: 0.05,
  tiling: 1,
  lightDir: computeLightDir(sunAngle, sunHeight),
  parallaxSteps: DEFAULT_PARALLAX_STEPS,
});

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(0, 1.5, 2.5, 1), minZoom: 1, maxZoom: 10 },
  (updates) => cameraUniform.patch(updates),
);

function sampleHeightDepth(uv: d.v2f, ddx: d.v2f, ddy: d.v2f) {
  'use gpu';
  return 1 - std.textureSampleGrad(nharmView.$, sampler.$, uv, MATERIAL_LAYER.height, ddx, ddy).r;
}

const vertexFn = tgpu.vertexFn({
  in: { position: d.vec3f, uv: d.vec2f },
  out: {
    pos: d.builtin.position,
    uv: d.vec2f,
    worldPos: d.vec3f,
    T: d.vec3f,
    B: d.vec3f,
    N: d.vec3f,
  },
})(({ position, uv }) => {
  'use gpu';
  const camera = cameraUniform.$;
  const N = planeConstants.normal.$;
  const T = planeConstants.tangent.$;
  const B = std.cross(T, N);
  const clipPos = camera.projection * camera.view * d.vec4f(position, 1);
  return { pos: clipPos, uv, worldPos: d.vec3f(position), T, B, N };
});

const fragmentFn = tgpu.fragmentFn({
  in: {
    uv: d.vec2f,
    worldPos: d.vec3f,
    T: d.vec3f,
    B: d.vec3f,
    N: d.vec3f,
    fragCoord: d.builtin.position,
  },
  out: d.vec4f,
})(({ uv, worldPos, T, B, N, fragCoord }) => {
  'use gpu';
  randf.seed2(fragCoord.xy * 0.001);

  const camera = cameraUniform.$;
  const params = pomParams.$;

  const lightDir = params.lightDir;
  const viewDir = std.normalize(camera.position.xyz - worldPos);
  const viewDirTS = toTangentSpace(viewDir, T, B, N);
  const lightDirTS = toTangentSpace(lightDir, T, B, N);

  const jitter = randf.sample();

  const tiledUv = uv * params.tiling;
  const pomDdx = std.dpdx(tiledUv);
  const pomDdy = std.dpdy(tiledUv);

  const stepCount = std.max(params.parallaxSteps, 1);
  const stepCountF = d.f32(stepCount);
  const layerDepth = 1 / stepCountF;

  // View ray march (parallax occlusion)
  let sampleUv = d.vec2f(tiledUv);
  let sampleDepth = d.f32(0);

  if (params.heightScale > 0.00001) {
    const uvStep = pomUvStep(viewDirTS, params.heightScale, stepCountF) * params.tiling;
    // Shift start forward by half the march range so depth=0.5 features don't sink
    const centeredUv = d.vec2f(tiledUv + uvStep * (stepCountF * 0.5));
    let marchUv = d.vec2f(centeredUv - uvStep * jitter);
    let depth = layerDepth * jitter;

    let surfaceDepth = sampleHeightDepth(marchUv, pomDdx, pomDdy);
    let prevUv = d.vec2f(marchUv);
    let prevDepth = depth;
    let prevSurfaceDepth = surfaceDepth;

    for (let i = d.u32(0); i < MAX_PARALLAX_STEPS; i++) {
      if (i >= stepCount) {
        break;
      }

      prevUv = d.vec2f(marchUv);
      prevDepth = depth;
      prevSurfaceDepth = surfaceDepth;
      marchUv -= uvStep;
      depth = depth + layerDepth;

      surfaceDepth = sampleHeightDepth(marchUv, pomDdx, pomDdy);
      if (depth >= surfaceDepth) {
        break;
      }
    }

    const prevGap = prevSurfaceDepth - prevDepth;
    const currGap = surfaceDepth - depth;
    const t = std.clamp(prevGap / (prevGap - currGap), 0, 1);
    sampleUv = std.mix(prevUv, marchUv, t);
    sampleDepth = std.mix(prevDepth, depth, t);

    if (isOutOfBounds(sampleUv, params.tiling)) {
      std.discard();
    }
  }

  // Texture sampling
  const albedo = std.textureSample(albedoView.$, sampler.$, sampleUv).rgb;
  const rawN = std.textureSample(nharmView.$, sampler.$, sampleUv, MATERIAL_LAYER.normal).xyz;
  const ao = std.textureSample(nharmView.$, sampler.$, sampleUv, MATERIAL_LAYER.ao).r;
  const roughness = std.textureSample(nharmView.$, sampler.$, sampleUv, MATERIAL_LAYER.roughness).r;
  const metallic = std.textureSample(nharmView.$, sampler.$, sampleUv, MATERIAL_LAYER.metallic).r;

  const decoded = rawN * 2 - 1;
  const tsNormal = std.normalize(d.vec3f(decoded.xy * d.vec2f(1, -1), decoded.z));
  const worldNormal = std.normalize(T * tsNormal.x + B * tsNormal.y + N * tsNormal.z);

  // Shadow ray march (soft parallax shadow)
  let shadowFactor = d.f32(1);

  if (params.heightScale > 0.00001 && lightDirTS.z > 0) {
    const uvStep = pomUvStep(lightDirTS, params.heightScale, stepCountF);
    const softShadowMultiplier = d.f32(16);
    let shadowUv = d.vec2f(sampleUv + uvStep * jitter);
    let shadowDepth = sampleDepth - layerDepth * jitter;
    let marchedDepth = layerDepth * jitter;

    for (let i = d.u32(0); i < MAX_PARALLAX_STEPS; i++) {
      if (i >= stepCount) {
        break;
      }

      shadowUv = shadowUv + uvStep;
      shadowDepth = shadowDepth - layerDepth;
      marchedDepth = marchedDepth + layerDepth;

      if (isOutOfBounds(shadowUv, params.tiling) || shadowDepth <= 0) {
        break;
      }

      const currentHeight = sampleHeightDepth(shadowUv, pomDdx, pomDdy);
      if (shadowDepth >= currentHeight) {
        shadowFactor = 0;
        break;
      }

      const gap = currentHeight - shadowDepth;
      shadowFactor = std.min(shadowFactor, (softShadowMultiplier * gap) / marchedDepth);
    }

    shadowFactor = std.clamp(shadowFactor, 0, 1);
  }

  const H = std.normalize(viewDir + lightDir);

  const NdotL = std.max(0, std.dot(worldNormal, lightDir));
  const NdotV = std.max(0, std.dot(worldNormal, viewDir));
  const NdotH = std.max(0, std.dot(worldNormal, H));
  const HdotV = std.max(0, std.dot(H, viewDir));

  // F0: 0.04 for dielectrics, blend toward albedo for metals
  const F0 = std.mix(d.vec3f(0.04), albedo, metallic);

  const D = distributionGGX(NdotH, roughness);
  const G = geometrySmith(NdotV, NdotL, roughness);
  const F = fresnelSchlick(HdotV, F0);

  const kD = (1 - F) * (1 - metallic);
  const diffuse = (kD * albedo) / Math.PI;
  const specular = (F * D * G) / std.max(4 * NdotV * NdotL, 0.001);

  let color = d.vec3f(0.03) * albedo * ao + (diffuse + specular) * NdotL * shadowFactor;

  // Reinhard tone mapping + gamma correction (linear → sRGB)
  color /= color + 1;
  color = std.pow(color, d.vec3f(1 / 2.2));

  return d.vec4f(color, 1);
});

const pipeline = root
  .createRenderPipeline({
    attribs: vertexLayout.attrib,
    vertex: vertexFn,
    fragment: fragmentFn,
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  })
  .with(vertexLayout, planeMesh.vertexBuffer)
  .withIndexBuffer(planeMesh.indexBuffer);

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
    .withColorAttachment({ view: context, clearValue: [0, 0, 0, 1] })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .drawIndexed(planeMesh.indexCount);
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = defineControls({
  'custom textures': {
    onButtonClick: loadCustomMaterial,
  },
  material: {
    initial: DEFAULT_MATERIAL,
    options: MATERIAL_IDS,
    onSelectChange(value) {
      void setMaterial(value).catch((error) => {
        console.error(`Failed to load POM material "${value}"`, error);
      });
    },
  },
  tiling: {
    initial: 1,
    min: 0.1,
    max: 3,
    step: 0.1,
    onSliderChange(v) {
      pomParams.patch({ tiling: v });
    },
  },
  'parallax strength': {
    initial: 0.05,
    min: 0,
    max: 0.3,
    step: 0.005,
    onSliderChange(v) {
      pomParams.patch({ heightScale: v });
    },
  },
  'parallax steps': {
    initial: DEFAULT_PARALLAX_STEPS,
    min: 4,
    max: MAX_PARALLAX_STEPS,
    step: 1,
    onSliderChange(v) {
      pomParams.patch({ parallaxSteps: Math.round(v) });
    },
  },
  'sun height': {
    initial: INITIAL_SUN_HEIGHT,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange(v) {
      sunHeight = v;
      pomParams.patch({ lightDir: computeLightDir(sunAngle, sunHeight) });
    },
  },
  'sun angle': {
    initial: Math.round((INITIAL_SUN_ANGLE * 180) / Math.PI),
    min: 0,
    max: 360,
    step: 1,
    onSliderChange(v) {
      sunAngle = (v * Math.PI) / 180;
      pomParams.patch({ lightDir: computeLightDir(sunAngle, sunHeight) });
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

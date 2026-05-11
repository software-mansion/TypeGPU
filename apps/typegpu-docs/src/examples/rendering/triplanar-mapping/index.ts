import tgpu, { d, std } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import { loadModel } from './load-model.ts';
import { createSplitComparison } from './split-comparison.ts';
import {
  DEFAULT_MATERIAL,
  INITIAL_PARAMS,
  MATERIAL_IDS,
  TriplanarParams,
  VertexOutput,
  VIEW_MODES,
  modelVertexLayout,
  type MaterialId,
} from './schemas.ts';

const MODEL_PATH = '/TypeGPU/assets/triplanar-mapping/suzanne.obj';
const MATERIAL_PATH = '/TypeGPU/assets/pom';
const MATERIAL_SIZE = [1024, 1024] as const;
const MATERIAL_MIP_LEVELS = 11;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const materialLayout = tgpu.bindGroupLayout({
  albedo: { texture: d.texture2d() },
  normal: { texture: d.texture2d() },
  ao: { texture: d.texture2d() },
  roughness: { texture: d.texture2d() },
  metallic: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

function createMaterialTexture(srgb = false) {
  return root
    .createTexture({
      size: MATERIAL_SIZE,
      format: 'rgba8unorm',
      mipLevelCount: MATERIAL_MIP_LEVELS,
      ...(srgb ? { viewFormats: ['rgba8unorm-srgb'] } : {}),
    })
    .$usage('sampled', 'render');
}

async function loadImage(src: string) {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${src}`);
  }

  return createImageBitmap(await response.blob());
}

type MaterialImages = readonly [ImageBitmap, ImageBitmap, ImageBitmap, ImageBitmap, ImageBitmap];

function loadMaterialImages(material: MaterialId): Promise<MaterialImages> {
  const path = `${MATERIAL_PATH}/${material}`;
  return Promise.all([
    loadImage(`${path}/albedo.png`),
    loadImage(`${path}/normal.png`),
    loadImage(`${path}/ao.png`),
    loadImage(`${path}/roughness.png`),
    loadImage(`${path}/metallic.png`),
  ]);
}

function closeImages(images: MaterialImages) {
  for (const image of images) {
    image.close();
  }
}

const albedoTexture = createMaterialTexture(true);
const normalTexture = createMaterialTexture();
const aoTexture = createMaterialTexture();
const roughnessTexture = createMaterialTexture();
const metallicTexture = createMaterialTexture();

function applyMaterialImages(images: MaterialImages) {
  albedoTexture.write(images[0]);
  normalTexture.write(images[1]);
  aoTexture.write(images[2]);
  roughnessTexture.write(images[3]);
  metallicTexture.write(images[4]);

  albedoTexture.generateMipmaps();
  normalTexture.generateMipmaps();
  aoTexture.generateMipmaps();
  roughnessTexture.generateMipmaps();
  metallicTexture.generateMipmaps();
  closeImages(images);
}

let disposed = false;
let materialLoadRequestId = 0;
async function setMaterial(material: MaterialId) {
  const requestId = ++materialLoadRequestId;
  const images = await loadMaterialImages(material);

  if (disposed || requestId !== materialLoadRequestId) {
    closeImages(images);
    return;
  }

  applyMaterialImages(images);
}

const model = await loadModel(root, MODEL_PATH);
await setMaterial(DEFAULT_MATERIAL);

const sampler = root.createSampler({
  addressModeU: 'repeat',
  addressModeV: 'repeat',
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
  maxAnisotropy: 4,
});

const materialBindGroup = root.createBindGroup(materialLayout, {
  albedo: albedoTexture.createView(d.texture2d(), { format: 'rgba8unorm-srgb' }),
  normal: normalTexture.createView(d.texture2d()),
  ao: aoTexture.createView(d.texture2d()),
  roughness: roughnessTexture.createView(d.texture2d()),
  metallic: metallicTexture.createView(d.texture2d()),
  sampler,
});

const cameraUniform = root.createUniform(Camera);
const paramsUniform = root.createUniform(TriplanarParams, INITIAL_PARAMS);

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(0, 1, -5, 1),
    target: d.vec4f(0, 0, 0, 1),
    minZoom: 1.5,
    maxZoom: 8,
  },
  (updates) => cameraUniform.patch(updates),
);

const splitComparison = createSplitComparison(canvas, {
  leftLabel: 'Triplanar Mapping',
  rightLabel: 'Mesh UVs',
  onChange(ratio) {
    paramsUniform.patch({ splitX: canvas.width * ratio });
  },
});

function triplanarWeights(n: d.v3f, sharpness: number) {
  'use gpu';
  const w = std.pow(std.abs(n), d.vec3f(sharpness));
  return w / std.max(w.x + w.y + w.z, 0.0001);
}

function axisSign(v: number) {
  'use gpu';
  return std.select(d.f32(-1), d.f32(1), v >= 0);
}

function sampleAlbedo(uv: d.v2f) {
  'use gpu';
  return std.textureSample(materialLayout.$.albedo, materialLayout.$.sampler, uv).rgb;
}

function sampleAo(uv: d.v2f) {
  'use gpu';
  return std.textureSample(materialLayout.$.ao, materialLayout.$.sampler, uv).r;
}

function sampleRoughness(uv: d.v2f) {
  'use gpu';
  return std.textureSample(materialLayout.$.roughness, materialLayout.$.sampler, uv).r;
}

function sampleMetallic(uv: d.v2f) {
  'use gpu';
  return std.textureSample(materialLayout.$.metallic, materialLayout.$.sampler, uv).r;
}

function sampleNormal(uv: d.v2f) {
  'use gpu';
  const decoded =
    std.textureSample(materialLayout.$.normal, materialLayout.$.sampler, uv).rgb * 2 - 1;
  return std.normalize(d.vec3f(decoded.x, -decoded.y, decoded.z));
}

function triplanarNormal(
  n: d.v3f,
  weights: d.v3f,
  uvX: d.v2f,
  uvY: d.v2f,
  uvZ: d.v2f,
  ratio: number,
) {
  'use gpu';
  const tx = sampleNormal(uvX);
  const ty = sampleNormal(uvY);
  const tz = sampleNormal(uvZ);

  const baseX = d.vec3f(axisSign(n.x), 0, 0);
  const baseY = d.vec3f(0, axisSign(n.y), 0);
  const baseZ = d.vec3f(0, 0, axisSign(n.z));

  const nx = std.normalize(d.vec3f(tx.z * baseX.x, tx.y, tx.x));
  const ny = std.normalize(d.vec3f(ty.x, ty.z * baseY.y, ty.y));
  const nz = std.normalize(d.vec3f(tz.x, tz.y, tz.z * baseZ.z));

  const detail = (nx - baseX) * weights.x + (ny - baseY) * weights.y + (nz - baseZ) * weights.z;
  return std.normalize(std.mix(n, std.normalize(n + detail), ratio));
}

function meshUvNormal(uv: d.v2f, worldNormal: d.v3f, worldTangent: d.v4f, ratio: number) {
  'use gpu';
  const n = std.normalize(worldNormal);
  const t = std.normalize(worldTangent.xyz - n * std.dot(n, worldTangent.xyz));
  const b = std.normalize(std.cross(n, t) * worldTangent.w);
  const mapped = sampleNormal(uv);
  const normal = std.normalize(t * mapped.x + b * mapped.y + n * mapped.z);

  return std.normalize(std.mix(n, normal, ratio));
}

function toDisplayColor(linear: d.v3f) {
  'use gpu';
  return std.pow(std.max(linear, d.vec3f(0)), d.vec3f(1 / 2.2));
}

function shade(
  albedo: d.v3f,
  normal: d.v3f,
  ao: number,
  roughness: number,
  metallic: number,
  worldPos: d.v3f,
  cameraPos: d.v3f,
  lightDir: d.v3f,
) {
  'use gpu';
  const L = std.normalize(lightDir);
  const V = std.normalize(cameraPos - worldPos);
  const H = std.normalize(L + V);
  const NdotL = std.max(std.dot(normal, L), 0);
  const NdotH = std.max(std.dot(normal, H), 0);

  const ambient = albedo * (0.08 + ao * 0.22);
  const diffuse = albedo * (1 - metallic) * NdotL * 0.85;
  const specularPower = std.mix(96, 8, roughness);
  const specularColor = std.mix(d.vec3f(0.04), albedo, metallic);
  const specular = specularColor * std.pow(NdotH, specularPower) * (1 - roughness) * 0.6;

  return ambient + diffuse + specular;
}

const vertexShader = tgpu.vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, uv: d.vec2f, tangent: d.vec4f },
  out: VertexOutput,
})((input) => {
  'use gpu';
  const worldPosition = d.vec4f(input.position, 1);
  const camera = cameraUniform.$;

  return {
    clipPosition: camera.projection * camera.view * worldPosition,
    worldPos: input.position,
    worldNormal: std.normalize(input.normal),
    worldTangent: d.vec4f(std.normalize(input.tangent.xyz), input.tangent.w),
    uv: input.uv,
  };
});

const fragmentShader = tgpu.fragmentFn({
  in: VertexOutput,
  out: d.vec4f,
})((input) => {
  'use gpu';
  const params = paramsUniform.$;
  const meshNormal = std.normalize(input.worldNormal);
  const weights = triplanarWeights(meshNormal, params.sharpness);

  const uvX =
    d.vec2f(input.worldPos.z * axisSign(meshNormal.x), input.worldPos.y) * params.triplanarScale;
  const uvY =
    d.vec2f(input.worldPos.x * axisSign(meshNormal.y), input.worldPos.z) * params.triplanarScale;
  const uvZ =
    d.vec2f(input.worldPos.x * axisSign(meshNormal.z), input.worldPos.y) * params.triplanarScale;

  const albedoX = sampleAlbedo(uvX);
  const albedoY = sampleAlbedo(uvY);
  const albedoZ = sampleAlbedo(uvZ);
  const triAlbedo = albedoX * weights.x + albedoY * weights.y + albedoZ * weights.z;

  const aoX = sampleAo(uvX);
  const aoY = sampleAo(uvY);
  const aoZ = sampleAo(uvZ);
  const triAo = aoX * weights.x + aoY * weights.y + aoZ * weights.z;
  const triRoughness =
    sampleRoughness(uvX) * weights.x +
    sampleRoughness(uvY) * weights.y +
    sampleRoughness(uvZ) * weights.z;
  const triMetallic =
    sampleMetallic(uvX) * weights.x +
    sampleMetallic(uvY) * weights.y +
    sampleMetallic(uvZ) * weights.z;

  const triNormal = triplanarNormal(meshNormal, weights, uvX, uvY, uvZ, params.materialNormalRatio);
  const meshUv = d.vec2f(input.uv.x, 1 - input.uv.y) * params.uvScale;
  const meshAlbedo = sampleAlbedo(meshUv);
  const meshAo = sampleAo(meshUv);
  const meshRoughness = sampleRoughness(meshUv);
  const meshMetallic = sampleMetallic(meshUv);
  const meshMappedNormal = meshUvNormal(
    meshUv,
    meshNormal,
    input.worldTangent,
    params.materialNormalRatio,
  );

  let albedo = d.vec3f(triAlbedo);
  let normal = d.vec3f(triNormal);
  let ao = triAo;
  let roughness = triRoughness;
  let metallic = triMetallic;

  const showMeshUvs = input.clipPosition.x > params.splitX;
  if (showMeshUvs) {
    albedo = d.vec3f(meshAlbedo);
    normal = d.vec3f(meshMappedNormal);
    ao = meshAo;
    roughness = meshRoughness;
    metallic = meshMetallic;
  }

  if (params.debugMode === 1) {
    return d.vec4f(toDisplayColor(albedo), 1);
  }
  if (params.debugMode === 2) {
    return d.vec4f(weights, 1);
  }
  if (params.debugMode === 3) {
    return d.vec4f(toDisplayColor(albedoX), 1);
  }
  if (params.debugMode === 4) {
    return d.vec4f(toDisplayColor(albedoY), 1);
  }
  if (params.debugMode === 5) {
    return d.vec4f(toDisplayColor(albedoZ), 1);
  }
  if (params.debugMode === 6) {
    return d.vec4f(normal * 0.5 + 0.5, 1);
  }

  const lit = shade(
    albedo,
    normal,
    ao,
    roughness,
    metallic,
    input.worldPos,
    cameraUniform.$.position.xyz,
    params.lightDir,
  );
  return d.vec4f(toDisplayColor(lit), 1);
});

const pipeline = root
  .createRenderPipeline({
    attribs: modelVertexLayout.attrib,
    vertex: vertexShader,
    fragment: fragmentShader,
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  })
  .with(modelVertexLayout, model.vertexBuffer)
  .with(materialBindGroup);

function createDepthTexture() {
  splitComparison.sync();
  return root
    .createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth32float',
    })
    .$usage('render');
}

let depthTexture = createDepthTexture();

let frameId: number;
function frame() {
  pipeline
    .withColorAttachment({ view: context })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .draw(model.vertexCount);

  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = defineControls({
  material: {
    initial: DEFAULT_MATERIAL,
    options: MATERIAL_IDS,
    onSelectChange(material) {
      void setMaterial(material);
    },
  },
  view: {
    initial: 'lit',
    options: VIEW_MODES,
    onSelectChange(mode) {
      paramsUniform.patch({ debugMode: VIEW_MODES.indexOf(mode) });
    },
  },
  'triplanar scale': {
    initial: INITIAL_PARAMS.triplanarScale,
    min: 0.5,
    max: 10,
    step: 0.1,
    onSliderChange(triplanarScale) {
      paramsUniform.patch({ triplanarScale });
    },
  },
  'UV scale': {
    initial: INITIAL_PARAMS.uvScale,
    min: 0.25,
    max: 6,
    step: 0.05,
    onSliderChange(uvScale) {
      paramsUniform.patch({ uvScale });
    },
  },
  'blend sharpness': {
    initial: INITIAL_PARAMS.sharpness,
    min: 1,
    max: 10,
    step: 0.1,
    onSliderChange(sharpness) {
      paramsUniform.patch({ sharpness });
    },
  },
  'material normal ratio': {
    initial: INITIAL_PARAMS.materialNormalRatio,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange(materialNormalRatio) {
      paramsUniform.patch({ materialNormalRatio });
    },
  },
});

const resizeObserver = new ResizeObserver(() => {
  depthTexture.destroy();
  depthTexture = createDepthTexture();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  disposed = true;
  cancelAnimationFrame(frameId);
  cleanupCamera();
  resizeObserver.disconnect();
  splitComparison.destroy();
  root.destroy();
}

// #endregion

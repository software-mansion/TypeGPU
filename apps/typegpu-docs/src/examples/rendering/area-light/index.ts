import tgpu, { common, d } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import { createEnvironmentFaces, ENVIRONMENT_MIP_LEVELS } from './environment.ts';
import { createSceneMesh, initialLights } from './geometry.ts';
import { LTC_1, LTC_2 } from './ltcTables.ts';
import {
  environmentLayout,
  LIGHT_COUNT,
  Lights,
  ltcLayout,
  RenderParams,
  sceneLayout,
  vertexLayout,
} from './schemas.ts';
import {
  lightFragment,
  lightVertex,
  mainFragment,
  mainVertex,
  skyFragment,
  skyVertex,
} from './shaders.ts';

const SAMPLE_COUNT = 4;
const INITIAL_PARAMS = {
  exposure: 1.12,
  environmentIntensity: 0.42,
  diffuseIblStrength: 0.06,
  specularIblStrength: 1.15,
} satisfies d.InferInput<typeof RenderParams>;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const mesh = createSceneMesh();
const vertexBuffer = root
  .createBuffer(vertexLayout.schemaForCount(mesh.vertexCount), (buffer) =>
    common.writeSoA(buffer, mesh.data),
  )
  .$usage('vertex');

const cameraUniform = root.createUniform(Camera);
const lightsUniform = root.createUniform(Lights, initialLights);
const paramsUniform = root.createUniform(RenderParams, INITIAL_PARAMS);

function createLtcTexture(data: Float32Array) {
  const texture = root.createTexture({ size: [64, 64], format: 'rgba32float' }).$usage('sampled');
  texture.write(data);
  return texture;
}

const sceneBindGroup = root.createBindGroup(sceneLayout, {
  camera: cameraUniform.buffer,
  lights: lightsUniform.buffer,
  params: paramsUniform.buffer,
});

const ltcBindGroup = root.createBindGroup(ltcLayout, {
  ltcMat: createLtcTexture(LTC_1),
  ltcAmp: createLtcTexture(LTC_2),
});

const environmentTexture = root
  .createTexture({
    size: [256, 256, 6],
    format: 'rgba8unorm',
    mipLevelCount: ENVIRONMENT_MIP_LEVELS,
  })
  .$usage('sampled', 'render');
environmentTexture.write(createEnvironmentFaces());
environmentTexture.generateMipmaps();

const environmentSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});

const environmentBindGroup = root.createBindGroup(environmentLayout, {
  environmentMap: environmentTexture.createView(d.textureCube(d.f32)),
  environmentSampler,
});

const framebufferSize = () => [canvas.width, canvas.height] as [number, number];

function createColorTexture() {
  return root
    .createTexture({
      size: framebufferSize(),
      format: presentationFormat,
      sampleCount: SAMPLE_COUNT,
    })
    .$usage('render');
}

function createDepthTexture() {
  return root
    .createTexture({
      size: framebufferSize(),
      format: 'depth24plus',
      sampleCount: SAMPLE_COUNT,
    })
    .$usage('render');
}

let colorTexture = createColorTexture();
let depthTexture = createDepthTexture();

const skyPipeline = root.createRenderPipeline({
  vertex: skyVertex,
  fragment: skyFragment,
  targets: { format: presentationFormat },
  multisample: { count: SAMPLE_COUNT },
});

const scenePipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex: mainVertex,
  fragment: mainFragment,
  targets: { format: presentationFormat },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  multisample: { count: SAMPLE_COUNT },
  primitive: { cullMode: 'none' },
});

const lightPipeline = root.createRenderPipeline({
  vertex: lightVertex,
  fragment: lightFragment,
  targets: { format: presentationFormat },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  multisample: { count: SAMPLE_COUNT },
  primitive: { cullMode: 'none' },
});

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(4.25, 2.45, 5.15, 1),
    target: d.vec4f(0, 0.55, -0.55, 1),
    minZoom: 1.8,
    maxZoom: 10,
  },
  (updates) => cameraUniform.patch(updates),
);

const resizeObserver = new ResizeObserver(() => {
  colorTexture.destroy();
  depthTexture.destroy();
  colorTexture = createColorTexture();
  depthTexture = createDepthTexture();
});
resizeObserver.observe(canvas);

let animationFrameId: number;

function render() {
  skyPipeline
    .with(sceneBindGroup)
    .with(environmentBindGroup)
    .withColorAttachment({
      view: colorTexture,
      clearValue: [0.02, 0.022, 0.025, 1],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  scenePipeline
    .with(sceneBindGroup)
    .with(ltcBindGroup)
    .with(environmentBindGroup)
    .with(vertexLayout, vertexBuffer)
    .withColorAttachment({
      view: colorTexture,
      loadOp: 'load',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .draw(mesh.vertexCount);

  lightPipeline
    .with(sceneBindGroup)
    .withColorAttachment({
      view: colorTexture,
      resolveTarget: context,
      loadOp: 'load',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthLoadOp: 'load',
      depthStoreOp: 'store',
    })
    .draw(6 * LIGHT_COUNT);

  animationFrameId = requestAnimationFrame(render);
}

animationFrameId = requestAnimationFrame(render);

const LIGHT_CONTROLS = [
  { label: 'key', index: 0, max: 12 },
  { label: 'fill', index: 1, max: 12 },
  { label: 'rim', index: 2, max: 8 },
] as const;

const lightControls = Object.assign(
  {},
  ...LIGHT_CONTROLS.map(({ label, index, max }) => ({
    [`${label} intensity`]: {
      initial: initialLights[index].intensity,
      min: 0,
      max,
      step: 0.1,
      onSliderChange: (intensity: number) => lightsUniform.patch({ [index]: { intensity } }),
    },
    [`${label} color`]: {
      initial: d.vec3f(...initialLights[index].color),
      onColorChange: (color: d.v3f) => lightsUniform.patch({ [index]: { color } }),
    },
  })),
);

export const controls = defineControls({
  exposure: {
    initial: INITIAL_PARAMS.exposure,
    min: 0.2,
    max: 2,
    step: 0.01,
    onSliderChange: (exposure) => paramsUniform.patch({ exposure }),
  },
  environment: {
    initial: INITIAL_PARAMS.environmentIntensity,
    min: 0,
    max: 2,
    step: 0.01,
    onSliderChange: (environmentIntensity) => paramsUniform.patch({ environmentIntensity }),
  },
  'diffuse ibl': {
    initial: INITIAL_PARAMS.diffuseIblStrength,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (diffuseIblStrength) => paramsUniform.patch({ diffuseIblStrength }),
  },
  'specular ibl': {
    initial: INITIAL_PARAMS.specularIblStrength,
    min: 0,
    max: 1.5,
    step: 0.01,
    onSliderChange: (specularIblStrength) => paramsUniform.patch({ specularIblStrength }),
  },
  ...lightControls,
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameId);
  cleanupCamera();
  resizeObserver.disconnect();
  colorTexture.destroy();
  depthTexture.destroy();
  root.destroy();
}

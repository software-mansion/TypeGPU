import tgpu, { d } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import { createEnvironmentFaces, ENVIRONMENT_MIP_LEVELS } from './environment.ts';
import { createSceneVertices, initialLights } from './geometry.ts';
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

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const vertices = createSceneVertices();
const vertexBuffer = root
  .createBuffer(vertexLayout.schemaForCount(vertices.length), vertices)
  .$usage('vertex');

const cameraUniform = root.createUniform(Camera);
const lightsUniform = root.createUniform(Lights, initialLights);
const paramsUniform = root.createUniform(RenderParams, {
  exposure: 1.12,
  environmentIntensity: 0.42,
  diffuseIblStrength: 0.06,
  specularIblStrength: 1.15,
});

const ltcMatTexture = root
  .createTexture({ size: [64, 64], format: 'rgba32float' })
  .$usage('sampled');
ltcMatTexture.write(LTC_1);

const ltcAmpTexture = root
  .createTexture({ size: [64, 64], format: 'rgba32float' })
  .$usage('sampled');
ltcAmpTexture.write(LTC_2);

const sceneBindGroup = root.createBindGroup(sceneLayout, {
  camera: cameraUniform.buffer,
  lights: lightsUniform.buffer,
  params: paramsUniform.buffer,
});

const ltcBindGroup = root.createBindGroup(ltcLayout, {
  ltcMat: ltcMatTexture,
  ltcAmp: ltcAmpTexture,
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

let colorTexture = root
  .createTexture({
    size: [canvas.width, canvas.height],
    format: presentationFormat,
    sampleCount: SAMPLE_COUNT,
  })
  .$usage('render');

let depthTexture = root
  .createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    sampleCount: SAMPLE_COUNT,
  })
  .$usage('render');

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
  colorTexture = root
    .createTexture({
      size: [canvas.width, canvas.height],
      format: presentationFormat,
      sampleCount: SAMPLE_COUNT,
    })
    .$usage('render');

  depthTexture.destroy();
  depthTexture = root
    .createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      sampleCount: SAMPLE_COUNT,
    })
    .$usage('render');
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
    .draw(vertices.length);

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

export const controls = defineControls({
  exposure: {
    initial: 1.12,
    min: 0.2,
    max: 2,
    step: 0.01,
    onSliderChange: (exposure) => paramsUniform.patch({ exposure }),
  },
  environment: {
    initial: 0.42,
    min: 0,
    max: 2,
    step: 0.01,
    onSliderChange: (environmentIntensity) => paramsUniform.patch({ environmentIntensity }),
  },
  'diffuse ibl': {
    initial: 0.06,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (diffuseIblStrength) => paramsUniform.patch({ diffuseIblStrength }),
  },
  'specular ibl': {
    initial: 1.15,
    min: 0,
    max: 1.5,
    step: 0.01,
    onSliderChange: (specularIblStrength) => paramsUniform.patch({ specularIblStrength }),
  },
  'key intensity': {
    initial: initialLights[0].intensity,
    min: 0,
    max: 12,
    step: 0.1,
    onSliderChange: (intensity) => lightsUniform.patch({ 0: { intensity } }),
  },
  'key color': {
    initial: d.vec3f(...initialLights[0].color),
    onColorChange: (color) => lightsUniform.patch({ 0: { color } }),
  },
  'fill intensity': {
    initial: initialLights[1].intensity,
    min: 0,
    max: 12,
    step: 0.1,
    onSliderChange: (intensity) => lightsUniform.patch({ 1: { intensity } }),
  },
  'fill color': {
    initial: d.vec3f(...initialLights[1].color),
    onColorChange: (color) => lightsUniform.patch({ 1: { color } }),
  },
  'rim intensity': {
    initial: initialLights[2].intensity,
    min: 0,
    max: 8,
    step: 0.1,
    onSliderChange: (intensity) => lightsUniform.patch({ 2: { intensity } }),
  },
  'rim color': {
    initial: d.vec3f(...initialLights[2].color),
    onColorChange: (color) => lightsUniform.patch({ 2: { color } }),
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameId);
  cleanupCamera();
  resizeObserver.disconnect();
  colorTexture.destroy();
  depthTexture.destroy();
  root.destroy();
}

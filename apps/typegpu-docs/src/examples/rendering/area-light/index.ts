import tgpu, { d } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import { createSceneVertices, initialLights } from './geometry.ts';
import { LTC_1, LTC_2 } from './ltcTables.ts';
import {
  LIGHT_COUNT,
  Lights,
  ltcLayout,
  RenderParams,
  sceneLayout,
  vertexLayout,
} from './schemas.ts';
import { lightFragment, lightVertex, mainFragment, mainVertex } from './shaders.ts';

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
  exposure: 0.85,
  ambientSky: [0.04, 0.05, 0.08],
  ambientGround: [0.025, 0.022, 0.02],
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

let depthTexture = root
  .createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus' })
  .$usage('render');

const scenePipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex: mainVertex,
  fragment: mainFragment,
  targets: { format: presentationFormat },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  primitive: { cullMode: 'none' },
});

const lightPipeline = root.createRenderPipeline({
  vertex: lightVertex,
  fragment: lightFragment,
  targets: { format: presentationFormat },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  primitive: { cullMode: 'none' },
});

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(4.2, 2.35, 5.1, 1),
    target: d.vec4f(0, 1.05, -1.1, 1),
    minZoom: 2.5,
    maxZoom: 9,
  },
  (updates) => cameraUniform.patch(updates),
);

const resizeObserver = new ResizeObserver(() => {
  depthTexture.destroy();
  depthTexture = root
    .createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus' })
    .$usage('render');
});
resizeObserver.observe(canvas);

let animationFrameId: number;

function render() {
  scenePipeline
    .with(sceneBindGroup)
    .with(ltcBindGroup)
    .with(vertexLayout, vertexBuffer)
    .withColorAttachment({
      view: context,
      clearValue: [0.02, 0.022, 0.025, 1],
      loadOp: 'clear',
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
    .withColorAttachment({ view: context, loadOp: 'load', storeOp: 'store' })
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
    initial: 0.85,
    min: 0.2,
    max: 2,
    step: 0.01,
    onSliderChange: (exposure) => paramsUniform.patch({ exposure }),
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
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameId);
  cleanupCamera();
  resizeObserver.disconnect();
  root.destroy();
}

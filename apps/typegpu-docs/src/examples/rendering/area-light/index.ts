import tgpu, { d } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import { createSceneVertices, initialLight } from './geometry.ts';
import { LTC_1, LTC_2 } from './ltcTables.ts';
import { ltcLayout, RectLight, RenderParams, sceneLayout, vertexLayout } from './schemas.ts';
import { mainFragment, mainVertex } from './shaders.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const currentLight = {
  center: [...initialLight.center] as typeof initialLight.center,
  dirX: [...initialLight.dirX] as typeof initialLight.dirX,
  dirY: [...initialLight.dirY] as typeof initialLight.dirY,
  halfSize: [...initialLight.halfSize] as typeof initialLight.halfSize,
  color: [...initialLight.color] as typeof initialLight.color,
  intensity: initialLight.intensity,
};
let surfaceRoughness: number | undefined;

function writeSceneVertices() {
  vertexBuffer.write(createSceneVertices(currentLight, surfaceRoughness));
}

const vertices = createSceneVertices(currentLight, surfaceRoughness);
const vertexBuffer = root
  .createBuffer(vertexLayout.schemaForCount(vertices.length), vertices)
  .$usage('vertex');

const cameraUniform = root.createUniform(Camera);
const lightUniform = root.createUniform(RectLight, initialLight);
const paramsUniform = root.createUniform(RenderParams, {
  exposure: 0.8,
  ambient: 0.035,
  specularStrength: 1,
});

const ltcMatTexture = root
  .createTexture({
    size: [64, 64],
    format: 'rgba32float',
  })
  .$usage('sampled');
ltcMatTexture.write(LTC_1);

const ltcAmpTexture = root
  .createTexture({
    size: [64, 64],
    format: 'rgba32float',
  })
  .$usage('sampled');
ltcAmpTexture.write(LTC_2);

const sceneBindGroup = root.createBindGroup(sceneLayout, {
  camera: cameraUniform.buffer,
  light: lightUniform.buffer,
  params: paramsUniform.buffer,
});

const ltcBindGroup = root.createBindGroup(ltcLayout, {
  ltcMat: ltcMatTexture,
  ltcAmp: ltcAmpTexture,
});

let depthTexture = root
  .createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
  })
  .$usage('render');

const pipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex: mainVertex,
  fragment: mainFragment,
  targets: { format: presentationFormat },
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
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
    .createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
    })
    .$usage('render');
});
resizeObserver.observe(canvas);

let animationFrameId: number;

function render() {
  pipeline
    .with(sceneBindGroup)
    .with(ltcBindGroup)
    .with(vertexLayout, vertexBuffer)
    .withColorAttachment({
      view: context,
      clearValue: [0.02, 0.022, 0.025, 1],
    })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .draw(vertices.length);

  animationFrameId = requestAnimationFrame(render);
}

animationFrameId = requestAnimationFrame(render);

export const controls = defineControls({
  exposure: {
    initial: 0.8,
    min: 0.2,
    max: 2,
    step: 0.01,
    onSliderChange: (exposure) => paramsUniform.patch({ exposure }),
  },
  roughness: {
    initial: 0.18,
    min: 0.03,
    max: 0.9,
    step: 0.01,
    onSliderChange: (roughness) => {
      surfaceRoughness = roughness;
      writeSceneVertices();
    },
  },
  intensity: {
    initial: initialLight.intensity,
    min: 0,
    max: 12,
    step: 0.1,
    onSliderChange: (intensity) => {
      currentLight.intensity = intensity;
      lightUniform.patch({ intensity });
      writeSceneVertices();
    },
  },
  'light color': {
    initial: d.vec3f(...initialLight.color),
    onColorChange: (color) => {
      currentLight.color = [color.x, color.y, color.z];
      lightUniform.patch({ color });
      writeSceneVertices();
    },
  },
  'light size': {
    initial: d.vec2f(...initialLight.halfSize),
    min: d.vec2f(0.25, 0.25),
    max: d.vec2f(2.4, 1.6),
    step: d.vec2f(0.01, 0.01),
    onVectorSliderChange: (halfSize) => {
      currentLight.halfSize = [halfSize.x, halfSize.y];
      lightUniform.patch({ halfSize });
      writeSceneVertices();
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameId);
  cleanupCamera();
  resizeObserver.disconnect();
  root.destroy();
}

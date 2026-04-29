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
type LightIndex = 0 | 1 | 2;

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
let skyGlow = INITIAL_PARAMS.environmentIntensity;
let neonStrength = 1;
let discoMode = false;
let discoStartedAt = performance.now();

const baseLightColors = [
  d.vec3f(...initialLights[0].color),
  d.vec3f(...initialLights[1].color),
  d.vec3f(...initialLights[2].color),
] as const;
const discoColors = [d.vec3f(), d.vec3f(), d.vec3f()] as const;

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

function writeHueColor(target: d.v3f, hue: number) {
  const h = (((hue % 1) + 1) % 1) * 6;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] =
    h < 1
      ? [1, x, 0]
      : h < 2
        ? [x, 1, 0]
        : h < 3
          ? [0, 1, x]
          : h < 4
            ? [0, x, 1]
            : h < 5
              ? [x, 0, 1]
              : [1, 0, x];

  target[0] = r;
  target[1] = g;
  target[2] = b;
}

function patchLight(index: LightIndex, color: d.v3f, strength = 1) {
  const update = {
    color,
    intensity: initialLights[index].intensity * neonStrength * strength,
  };

  if (index === 0) {
    lightsUniform.patch({ 0: update });
  } else if (index === 1) {
    lightsUniform.patch({ 1: update });
  } else {
    lightsUniform.patch({ 2: update });
  }
}

function restoreLights() {
  for (const [index, color] of baseLightColors.entries()) {
    patchLight(index as LightIndex, color);
  }
}

function updateDisco(time: number) {
  if (!discoMode) {
    return;
  }

  const t = (time - discoStartedAt) * 0.00014;
  for (const [index, color] of discoColors.entries()) {
    writeHueColor(color, t + index / discoColors.length);
    patchLight(index as LightIndex, color, 0.82 + Math.sin(time * 0.003 + index * 1.7) * 0.18);
  }
}

function render(time: number) {
  updateDisco(time);

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

export const controls = defineControls({
  'disco mode': {
    initial: false,
    onToggleChange: (enabled) => {
      discoMode = enabled;
      discoStartedAt = performance.now();
      paramsUniform.patch({ environmentIntensity: enabled ? 0 : skyGlow });
      if (!enabled) {
        restoreLights();
      }
    },
  },
  exposure: {
    initial: INITIAL_PARAMS.exposure,
    min: 0.2,
    max: 2,
    step: 0.01,
    onSliderChange: (exposure) => paramsUniform.patch({ exposure }),
  },
  'sky glow': {
    initial: INITIAL_PARAMS.environmentIntensity,
    min: 0,
    max: 2,
    step: 0.01,
    onSliderChange: (environmentIntensity) => {
      skyGlow = environmentIntensity;
      paramsUniform.patch({ environmentIntensity: discoMode ? 0 : skyGlow });
    },
  },
  'wet reflections': {
    initial: INITIAL_PARAMS.specularIblStrength,
    min: 0,
    max: 1.5,
    step: 0.01,
    onSliderChange: (specularIblStrength) => paramsUniform.patch({ specularIblStrength }),
  },
  'neon strength': {
    initial: neonStrength,
    min: 0,
    max: 1.5,
    step: 0.01,
    onSliderChange: (strength) => {
      neonStrength = strength;
      if (!discoMode) {
        restoreLights();
      }
    },
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

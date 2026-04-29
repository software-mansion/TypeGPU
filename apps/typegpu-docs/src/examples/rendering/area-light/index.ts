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
const DISCO_TRANSITION_MS = 1600;
const DISCO_HUE_SPEED = 0.00008;
const INITIAL_PARAMS = {
  exposure: 1.12,
  environmentIntensity: 0.42,
  diffuseIblStrength: 0.06,
  specularIblStrength: 1.15,
  wetness: 0.86,
  time: 0,
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
let discoEnabled = false;
let discoMix = 0;
let discoStartedAt = performance.now();
let previousFrameTime = discoStartedAt;

const baseLightColors = [
  d.vec3f(...initialLights[0].color),
  d.vec3f(...initialLights[1].color),
  d.vec3f(...initialLights[2].color),
] as const;
const baseLightIntensities = new Float32Array(initialLights.map((light) => light.intensity));
const discoColors = [d.vec3f(), d.vec3f(), d.vec3f()] as const;
const mixedLightColors = [d.vec3f(), d.vec3f(), d.vec3f()] as const;

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

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function mixColor(target: d.v3f, from: d.v3f, to: d.v3f, amount: number) {
  target[0] = from[0] + (to[0] - from[0]) * amount;
  target[1] = from[1] + (to[1] - from[1]) * amount;
  target[2] = from[2] + (to[2] - from[2]) * amount;
}

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
    intensity: baseLightIntensities[index] * strength,
  };

  if (index === 0) {
    lightsUniform.patch({ 0: update });
  } else if (index === 1) {
    lightsUniform.patch({ 1: update });
  } else {
    lightsUniform.patch({ 2: update });
  }
}

function setLightColor(index: LightIndex, color: d.v3f) {
  const target = baseLightColors[index];
  target[0] = color[0];
  target[1] = color[1];
  target[2] = color[2];

  if (!discoEnabled && discoMix === 0) {
    patchLight(index, target);
  }
}

function setLightIntensity(index: LightIndex, intensity: number) {
  baseLightIntensities[index] = intensity;
  if (!discoEnabled && discoMix === 0) {
    patchLight(index, baseLightColors[index]);
  }
}

function updateDisco(time: number) {
  if (!discoEnabled && discoMix === 0) {
    return;
  }

  const delta = Math.min(time - previousFrameTime, 64);
  const targetMix = discoEnabled ? 1 : 0;
  discoMix = clamp01(discoMix + Math.sign(targetMix - discoMix) * (delta / DISCO_TRANSITION_MS));

  const blend = smoothstep(discoMix);
  const t = (time - discoStartedAt) * DISCO_HUE_SPEED;
  paramsUniform.patch({ environmentIntensity: skyGlow * (1 - blend) });

  for (const [index, color] of discoColors.entries()) {
    writeHueColor(color, t + index / discoColors.length);
    mixColor(mixedLightColors[index], baseLightColors[index], color, blend);
    const pulse = smoothstep((Math.sin(time * 0.0015 + index * 2.2) + 1) * 0.5);
    patchLight(index as LightIndex, mixedLightColors[index], 1 + (pulse - 1) * blend);
  }
}

function render(time: number) {
  updateDisco(time);
  previousFrameTime = time;
  paramsUniform.patch({ time: time * 0.001 });

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
      discoEnabled = enabled;
      if (enabled) {
        discoStartedAt = performance.now();
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
      paramsUniform.patch({ environmentIntensity: skyGlow * (1 - smoothstep(discoMix)) });
    },
  },
  'shallow water': {
    initial: INITIAL_PARAMS.wetness,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (wetness) => paramsUniform.patch({ wetness }),
  },
  'key intensity': {
    initial: initialLights[0].intensity,
    min: 0,
    max: 12,
    step: 0.1,
    onSliderChange: (intensity) => setLightIntensity(0, intensity),
  },
  'key color': {
    initial: baseLightColors[0],
    onColorChange: (color) => setLightColor(0, color),
  },
  'fill intensity': {
    initial: initialLights[1].intensity,
    min: 0,
    max: 12,
    step: 0.1,
    onSliderChange: (intensity) => setLightIntensity(1, intensity),
  },
  'fill color': {
    initial: baseLightColors[1],
    onColorChange: (color) => setLightColor(1, color),
  },
  'rim intensity': {
    initial: initialLights[2].intensity,
    min: 0,
    max: 8,
    step: 0.1,
    onSliderChange: (intensity) => setLightIntensity(2, intensity),
  },
  'rim color': {
    initial: baseLightColors[2],
    onColorChange: (color) => setLightColor(2, color),
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

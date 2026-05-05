import { perlin3d } from '@typegpu/noise';
import tgpu, { common, d, std, type AutoFragmentIn, type TgpuFragmentFn } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import {
  ENVIRONMENT_SIZE,
  environmentFragment,
  environmentGenerationLayout,
  environmentVertex,
} from './environment.ts';
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
import { lightFragment, lightVertex, mainFragment, skyFragment, skyVertex } from './shaders.ts';
import type { InferGPURecord } from '../../../../../../packages/typegpu/src/shared/repr.ts';
import type { AnyFragmentInputBuiltin } from '../../../../../../packages/typegpu/src/builtin.ts';

const SAMPLE_COUNT = 4;
const DISCO_TRANSITION_MS = 1600;
const DISCO_HUE_SPEED = 0.00008;
const INITIAL_PARAMS = {
  exposure: 1.12,
  environmentIntensity: 0.25,
  diffuseIblStrength: 0.06,
  specularIblStrength: 0.95,
  wetness: 0.12,
  time: 0,
} satisfies d.InferInput<typeof RenderParams>;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const perlinCache = perlin3d.staticCache({ root, size: d.vec3u(128, 128, 128) });

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
    size: [ENVIRONMENT_SIZE, ENVIRONMENT_SIZE, 6],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');

const environmentFaceUniform = root.createUniform(d.u32);
const environmentGenerationBindGroup = root.createBindGroup(environmentGenerationLayout, {
  face: environmentFaceUniform.buffer,
});

const environmentPipeline = root.pipe(perlinCache.inject()).createRenderPipeline({
  vertex: environmentVertex,
  fragment: environmentFragment,
  targets: { format: 'rgba8unorm' },
});

for (let face = 0; face < 6; face++) {
  environmentFaceUniform.write(face);
  environmentPipeline
    .with(environmentGenerationBindGroup)
    .withColorAttachment({
      view: environmentTexture.createView('render', {
        baseArrayLayer: face,
        arrayLayerCount: 1,
      }),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);
}

const environmentSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const environmentBindGroup = root.createBindGroup(environmentLayout, {
  environmentMap: environmentTexture.createView(d.textureCube(d.f32)),
  environmentSampler,
});

function createRenderTargets() {
  const size = [canvas.width, canvas.height] as [number, number];

  return {
    color: root
      .createTexture({
        size,
        format: presentationFormat,
        sampleCount: SAMPLE_COUNT,
      })
      .$usage('render'),
    depth: root
      .createTexture({
        size,
        format: 'depth24plus',
        sampleCount: SAMPLE_COUNT,
      })
      .$usage('render'),
  };
}

function destroyRenderTargets(renderTargets: ReturnType<typeof createRenderTargets>) {
  renderTargets.color.destroy();
  renderTargets.depth.destroy();
}

let targets = createRenderTargets();
let skyGlow = INITIAL_PARAMS.environmentIntensity;
let discoEnabled = false;
let discoMix = 0;
let discoStartedAt = performance.now();
let previousFrameTime = discoStartedAt;

const lightState = initialLights.map((light) => ({
  color: d.vec3f(light.color),
  intensity: light.intensity,
}));

type test = TgpuFragmentFn<
  {
    worldPos: d.Vec3f;
    normal: d.Vec3f;
    albedo: d.Vec3f;
    roughness: d.F32;
    metallic: d.F32;
    wetness: d.F32;
  } & Record<string, AnyFragmentInputBuiltin>,
  d.Vec4f
>;

type test2 = TgpuFragmentFn<
  {
    worldPos: d.Vec3f;
    normal: d.Vec3f;
    albedo: d.Vec3f;
    roughness: d.F32;
    metallic: d.F32;
    wetness: d.F32;
  },
  d.Vec4f
>;

const skyPipeline = root.createRenderPipeline({
  vertex: skyVertex,
  fragment: skyFragment,
  targets: { format: presentationFormat },
  multisample: { count: SAMPLE_COUNT },
});

const scenePipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex: ({ position, normal, albedo, roughness, metallic, wetness }) => {
    'use gpu';
    const camera = sceneLayout.$.camera;
    return {
      $position: camera.projection * camera.view * d.vec4f(position, 1),
      worldPos: position,
      normal,
      albedo,
      material: d.vec3f(roughness, metallic, wetness),
    };
  },
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
    maxZoom: 14,
    minCameraY: 0.22,
  },
  (updates) => cameraUniform.patch(updates),
);

const resizeObserver = new ResizeObserver(() => {
  destroyRenderTargets(targets);
  targets = createRenderTargets();
});
resizeObserver.observe(canvas);

let animationFrameId: number;

function hueColor(hue: number) {
  const h = (((hue % 1) + 1) % 1) * 6;
  const x = 1 - std.abs((h % 2) - 1);
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

  return d.vec3f(r, g, b);
}

function patchLight(index: number, color = lightState[index].color, strength = 1) {
  lightsUniform.patch({
    [index]: {
      color,
      intensity: lightState[index].intensity * strength,
    },
  });
}

function setLightColor(index: number, color: d.v3f) {
  lightState[index].color = d.vec3f(color);

  if (!discoEnabled && discoMix === 0) {
    patchLight(index);
  }
}

function setLightIntensity(index: number, intensity: number) {
  lightState[index].intensity = intensity;
  if (!discoEnabled && discoMix === 0) {
    patchLight(index);
  }
}

function updateDisco(time: number) {
  if (!discoEnabled && discoMix === 0) {
    return;
  }

  const delta = std.min(time - previousFrameTime, 64);
  const targetMix = discoEnabled ? 1 : 0;
  discoMix = std.clamp(
    discoMix + std.sign(targetMix - discoMix) * (delta / DISCO_TRANSITION_MS),
    0,
    1,
  );

  const blend = std.smoothstep(0, 1, discoMix);
  const t = (time - discoStartedAt) * DISCO_HUE_SPEED;
  paramsUniform.patch({ environmentIntensity: skyGlow * (1 - blend) });

  for (const [index, light] of lightState.entries()) {
    const pulse = std.smoothstep(0, 1, (std.sin(time * 0.0015 + index * 2.2) + 1) * 0.5);
    patchLight(
      index,
      std.mix(light.color, hueColor(t + index / lightState.length), blend),
      1 + (pulse - 1) * blend,
    );
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
      view: targets.color,
      clearValue: [0.014, 0.012, 0.016, 1],
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
      view: targets.color,
      loadOp: 'load',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: targets.depth,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .draw(mesh.vertexCount);

  lightPipeline
    .with(sceneBindGroup)
    .withColorAttachment({
      view: targets.color,
      resolveTarget: context,
      loadOp: 'load',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: targets.depth,
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
    max: 0.5,
    step: 0.01,
    onSliderChange: (environmentIntensity) => {
      skyGlow = environmentIntensity;
      paramsUniform.patch({
        environmentIntensity: skyGlow * (1 - std.smoothstep(0, 1, discoMix)),
      });
    },
  },
  'shallow water': {
    initial: INITIAL_PARAMS.wetness,
    min: 0,
    max: 0.5,
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
    initial: lightState[0].color,
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
    initial: lightState[1].color,
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
    initial: lightState[2].color,
    onColorChange: (color) => setLightColor(2, color),
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameId);
  cleanupCamera();
  resizeObserver.disconnect();
  destroyRenderTargets(targets);
  perlinCache.destroy();
  root.destroy();
}

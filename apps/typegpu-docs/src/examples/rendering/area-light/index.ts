import tgpu, { common, d, std } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import { createSceneMesh, initialLights } from './geometry.ts';
import { LTC_1, LTC_2 } from './ltcTables.ts';
import {
  LIGHT_COUNT,
  Lights,
  RenderParams,
  createLtcLayout,
  sceneLayout,
  vertexLayout,
} from './schemas.ts';
import { createMainFragment, lightFragment, lightVertex, skyFragment } from './shaders.ts';

const SAMPLE_COUNT = 4;
const DISCO_TRANSITION_MS = 1600;
const DISCO_HUE_SPEED = 0.00008;

const root = await tgpu.init({ device: { optionalFeatures: ['float32-filterable'] } });
const ltcFilterable = root.enabledFeatures.has('float32-filterable');
const ltcLayout = createLtcLayout(ltcFilterable);
const mainFragment = createMainFragment(ltcLayout, ltcFilterable);

const INITIAL_PARAMS = {
  exposure: 1.12,
  environmentIntensity: 0.25,
  time: 0,
} satisfies d.InferInput<typeof RenderParams>;
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
  ltcSampler: root.createSampler(
    ltcFilterable
      ? {
          magFilter: 'linear',
          minFilter: 'linear',
        }
      : {
          magFilter: 'nearest',
          minFilter: 'nearest',
        },
  ),
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
let discoEnabled = false;
let discoMix = 0;
let discoStartedAt = performance.now();
let previousFrameTime = discoStartedAt;

const lightState = initialLights.map((light) => ({
  color: d.vec3f(light.color),
  intensity: light.intensity,
}));

const skyPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
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
    initPos: d.vec4f(4.1, 2.25, 5, 1),
    target: d.vec4f(-0.35, 0.52, -0.45, 1),
    minZoom: 1.8,
    maxZoom: 14,
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
  const h = ((hue % 1) + 1) % 1;
  const channel = (n: number) => {
    const k = (n + h * 6) % 6;
    return 1 - Math.max(0, Math.min(k, 4 - k, 1));
  };
  return d.vec3f(channel(5), channel(3), channel(1));
}

function patchLight(index: number, color = lightState[index].color, strength = 1) {
  lightsUniform.patch({ [index]: { color, intensity: lightState[index].intensity * strength } });
}

function updateUserLight(index: number, patch: { color?: d.v3f; intensity?: number }) {
  if (patch.color) {
    lightState[index].color = d.vec3f(patch.color);
  }
  if (patch.intensity !== undefined) {
    lightState[index].intensity = patch.intensity;
  }
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
  paramsUniform.patch({
    environmentIntensity: INITIAL_PARAMS.environmentIntensity * (1 - blend),
  });

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
    .draw(6, LIGHT_COUNT);

  animationFrameId = requestAnimationFrame(render);
}

animationFrameId = requestAnimationFrame(render);

const LIGHTS = [
  { name: 'key', maxIntensity: 12 },
  { name: 'fill', maxIntensity: 12 },
  { name: 'rim', maxIntensity: 8 },
] as const;

const lightControls = Object.fromEntries(
  LIGHTS.flatMap(({ name, maxIntensity }, i) => [
    [
      `${name} intensity`,
      {
        initial: initialLights[i].intensity,
        min: 0,
        max: maxIntensity,
        step: 0.1,
        onSliderChange: (intensity: number) => updateUserLight(i, { intensity }),
      },
    ],
    [
      `${name} color`,
      {
        initial: lightState[i].color,
        onColorChange: (color: d.v3f) => updateUserLight(i, { color }),
      },
    ],
  ]),
);

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
  ...lightControls,
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameId);
  cleanupCamera();
  resizeObserver.disconnect();
  destroyRenderTargets(targets);
  root.destroy();
}

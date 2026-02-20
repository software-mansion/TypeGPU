import tgpu, {
  d,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuBuffer,
} from 'typegpu';
import { computeCollisionsShader, computeGravityShader } from './compute.ts';
import {
  collisionBehaviors,
  initialPreset,
  type Preset,
  presets,
  sphereTextureNames,
} from './enums.ts';
import {
  loadModel,
  loadSkyBox,
  loadSphereTextures,
  skyBoxVertices,
} from './helpers.ts';
import { examplePresets } from './presets.ts';
import {
  mainFragment,
  mainVertex,
  skyBoxFragment,
  skyBoxVertex,
} from './render.ts';
import {
  cameraAccess,
  CelestialBody,
  computeLayout,
  filteringSamplerSlot,
  lightSourceAccess,
  renderBindGroupLayout,
  renderSkyBoxVertexLayout,
  renderVertexLayout,
  skyBoxAccess,
  SkyBoxVertex,
  Time,
  timeAccess,
} from './schemas.ts';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

// static resources (created on the example load)

const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const camera = root.createUniform(Camera);
const { cleanupCamera, targetCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(examplePresets[initialPreset].initialCameraPos, 1),
    minZoom: 10,
    maxZoom: 800,
  },
  (updates) => camera.writePartial(updates),
);

const skyBoxVertexBuffer = root
  .createBuffer(d.arrayOf(SkyBoxVertex, skyBoxVertices.length), skyBoxVertices)
  .$usage('vertex');
const skyBoxTexture = await loadSkyBox(root);
const skyBox = skyBoxTexture.createView(d.textureCube(d.f32));

let celestialBodiesCount = 0;
const { vertexBuffer: sphereVertexBuffer, vertexCount: sphereVertexCount } =
  await loadModel(root, '/TypeGPU/assets/gravity/sphere.obj');
const sphereTextures = await loadSphereTextures(root);
const celestialBodiesCountBuffer = root
  .createBuffer(d.i32)
  .$usage('uniform');
const time = root.createUniform(Time);
const lightSource = root.createUniform(d.vec3f);

// dynamic resources (recreated every time a preset is selected)

interface DynamicResources {
  celestialBodiesBufferA:
    & TgpuBuffer<d.WgslArray<typeof CelestialBody>>
    & StorageFlag;
  celestialBodiesBufferB:
    & TgpuBuffer<d.WgslArray<typeof CelestialBody>>
    & StorageFlag;
  computeCollisionsBindGroup: TgpuBindGroup<(typeof computeLayout)['entries']>;
  computeGravityBindGroup: TgpuBindGroup<(typeof computeLayout)['entries']>;
  renderBindGroup: TgpuBindGroup<(typeof renderBindGroupLayout)['entries']>;
}

const dynamicResourcesBox = {
  data: await loadPreset(initialPreset),
};

// Pipelines
const computeCollisionsPipeline = root
  .createComputePipeline({ compute: computeCollisionsShader });

const computeGravityPipeline = root
  .with(timeAccess, time)
  .createComputePipeline({ compute: computeGravityShader });

const skyBoxPipeline = root
  .with(filteringSamplerSlot, sampler)
  .with(cameraAccess, camera)
  .with(skyBoxAccess, skyBox)
  .createRenderPipeline({
    attribs: renderSkyBoxVertexLayout.attrib,
    vertex: skyBoxVertex,
    fragment: skyBoxFragment,
  });

const renderPipeline = root
  .with(filteringSamplerSlot, sampler)
  .with(lightSourceAccess, lightSource)
  .with(cameraAccess, camera)
  .createRenderPipeline({
    attribs: renderVertexLayout.attrib,
    vertex: mainVertex,
    fragment: mainFragment,

    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

function render() {
  computeCollisionsPipeline
    .with(dynamicResourcesBox.data.computeCollisionsBindGroup)
    .dispatchWorkgroups(celestialBodiesCount);

  computeGravityPipeline
    .with(dynamicResourcesBox.data.computeGravityBindGroup)
    .dispatchWorkgroups(celestialBodiesCount);

  skyBoxPipeline
    .withColorAttachment({
      view: context,
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
    })
    .with(renderSkyBoxVertexLayout, skyBoxVertexBuffer)
    .draw(skyBoxVertices.length);

  renderPipeline
    .withColorAttachment({
      view: context,
      loadOp: 'load',
      clearValue: [0, 1, 0, 1], // background color
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(renderVertexLayout, sphereVertexBuffer)
    .with(dynamicResourcesBox.data.renderBindGroup)
    .draw(sphereVertexCount, celestialBodiesCount);
}

let destroyed = false;
let lastTimestamp = 0;
// Frame loop
function frame(timestamp: DOMHighResTimeStamp) {
  if (destroyed) {
    return;
  }
  time.writePartial({
    passed: Math.min((timestamp - lastTimestamp) / 1000, 0.1),
  });
  lastTimestamp = timestamp;
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

async function loadPreset(preset: Preset): Promise<DynamicResources> {
  const presetData = examplePresets[preset];

  const celestialBodies: d.Infer<typeof CelestialBody>[] = presetData
    .celestialBodies.flatMap((group) =>
      group.elements.map((element) => ({
        destroyed: 0,
        position: element.position,
        velocity: element.velocity ?? d.vec3f(),
        mass: element.mass,
        radiusMultiplier: element.radiusMultiplier ?? 1,
        collisionBehavior: element.collisionBehavior
          ? collisionBehaviors[element.collisionBehavior]
          : collisionBehaviors.none,
        textureIndex: sphereTextureNames.indexOf(group.texture),
        ambientLightFactor: element.ambientLightFactor ?? 0.6,
      }))
    );

  const computeBufferA = root
    .createBuffer(
      d.arrayOf(CelestialBody, celestialBodies.length),
      celestialBodies,
    )
    .$usage('storage');
  const computeBufferB = root
    .createBuffer(d.arrayOf(CelestialBody, celestialBodies.length))
    .$usage('storage');

  const computeCollisionsBindGroup = root.createBindGroup(
    computeLayout,
    {
      celestialBodiesCount: celestialBodiesCountBuffer,
      inState: computeBufferA,
      outState: computeBufferB,
    },
  );

  const computeGravityBindGroup = root.createBindGroup(
    computeLayout,
    {
      celestialBodiesCount: celestialBodiesCountBuffer,
      inState: computeBufferB,
      outState: computeBufferA,
    },
  );

  const renderBindGroup = root.createBindGroup(renderBindGroupLayout, {
    celestialBodyTextures: sphereTextures,
    celestialBodies: computeBufferA,
  });

  celestialBodiesCount = celestialBodies.length;
  celestialBodiesCountBuffer.write(celestialBodies.length);
  lightSource.write(presetData.lightSource ?? d.vec3f());
  targetCamera(d.vec4f(presetData.initialCameraPos, 1));

  return {
    celestialBodiesBufferA: computeBufferA,
    celestialBodiesBufferB: computeBufferB,
    computeCollisionsBindGroup,
    computeGravityBindGroup,
    renderBindGroup,
  };
}

// #region Camera controls

export const controls = defineControls({
  preset: {
    initial: initialPreset,
    options: presets,
    async onSelectChange(value: Preset) {
      const oldData = dynamicResourcesBox.data;
      dynamicResourcesBox.data = await loadPreset(value);
      oldData.celestialBodiesBufferA.destroy();
      oldData.celestialBodiesBufferB.destroy();
    },
  },
  'simulation speed modifier': {
    initial: 0,
    min: -5,
    max: 5,
    step: 1,
    onSliderChange: (newValue: number) => {
      time.writePartial({ multiplier: 2 ** newValue });
    },
  },
});

const resizeObserver = new ResizeObserver(() => {
  depthTexture.destroy();
  depthTexture = root.device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
});
resizeObserver.observe(canvas);

function hideHelp() {
  const helpElem = document.getElementById('help');
  if (helpElem) {
    helpElem.style.opacity = '0';
  }
}
for (const eventName of ['click', 'keydown', 'wheel', 'touchstart']) {
  canvas.addEventListener(eventName, hideHelp, { once: true, passive: true });
}

export function onCleanup() {
  destroyed = true;
  cleanupCamera();
  resizeObserver.unobserve(canvas);
  root.destroy();
}

// #endregion

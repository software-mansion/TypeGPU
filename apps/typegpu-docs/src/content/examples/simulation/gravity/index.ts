import tgpu, {
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuBuffer,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
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
  Camera,
  cameraAccess,
  CelestialBody,
  computeLayout,
  filteringSamplerSlot,
  lightSourceAccess,
  renderBindGroupLayout,
  renderSkyBoxVertexLayout,
  renderVertexLayout,
  skyBoxSlot,
  SkyBoxVertex,
  Time,
  timeAccess,
} from './schemas.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const root = await tgpu.init();
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// static resources (created on the example load)

const sampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

let cameraPosition = examplePresets[initialPreset].initialCameraPos;
const cameraInitial = Camera({
  position: cameraPosition,
  view: m.mat4.lookAt(
    cameraPosition,
    d.vec3f(0, 0, 0),
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  ),
  projection: m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    d.mat4x4f(),
  ),
});
const camera = root.createUniform(Camera, cameraInitial);

const skyBoxVertexBuffer = root
  .createBuffer(d.arrayOf(SkyBoxVertex, skyBoxVertices.length), skyBoxVertices)
  .$usage('vertex');
const skyBoxTexture = await loadSkyBox(root);
const skyBox = skyBoxTexture.createView('sampled', { dimension: 'cube' });

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
const computeCollisionsPipeline = root['~unstable']
  .withCompute(computeCollisionsShader)
  .createPipeline();

const computeGravityPipeline = root['~unstable']
  .with(timeAccess, time)
  .withCompute(computeGravityShader)
  .createPipeline();

const skyBoxPipeline = root['~unstable']
  .with(filteringSamplerSlot, sampler)
  .with(skyBoxSlot, skyBox)
  .with(cameraAccess, camera)
  .withVertex(skyBoxVertex, renderSkyBoxVertexLayout.attrib)
  .withFragment(skyBoxFragment, { format: presentationFormat })
  .createPipeline();

const renderPipeline = root['~unstable']
  .with(filteringSamplerSlot, sampler)
  .with(lightSourceAccess, lightSource)
  .with(cameraAccess, camera)
  .withVertex(mainVertex, renderVertexLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
  .createPipeline();

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

function render() {
  computeCollisionsPipeline
    .with(computeLayout, dynamicResourcesBox.data.computeCollisionsBindGroup)
    .dispatchWorkgroups(celestialBodiesCount);

  computeGravityPipeline
    .with(computeLayout, dynamicResourcesBox.data.computeGravityBindGroup)
    .dispatchWorkgroups(celestialBodiesCount);

  skyBoxPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(renderSkyBoxVertexLayout, skyBoxVertexBuffer)
    .draw(skyBoxVertices.length);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'load',
      storeOp: 'store',
      clearValue: [0, 1, 0, 1], // background color
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(renderVertexLayout, sphereVertexBuffer)
    .with(renderBindGroupLayout, dynamicResourcesBox.data.renderBindGroup)
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
  cameraPosition = presetData.initialCameraPos;
  updateCameraPosition();

  return {
    celestialBodiesBufferA: computeBufferA,
    celestialBodiesBufferB: computeBufferB,
    computeCollisionsBindGroup,
    computeGravityBindGroup,
    renderBindGroup,
  };
}

// #region Camera controls

export const controls = {
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
};

const resizeObserver = new ResizeObserver(() => {
  const proj = m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    d.mat4x4f(),
  );

  camera.writePartial({ projection: proj });
  depthTexture.destroy();
  depthTexture = root.device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
});
resizeObserver.observe(canvas);

// Variables for mouse interaction.
let isDragging = false;
let prevX = 0;
let prevY = 0;

function updateCameraPosition() {
  const newView = m.mat4.lookAt(
    cameraPosition,
    d.vec3f(0, 0, 0),
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  camera.writePartial({ view: newView, position: cameraPosition });
}

function updateCameraOrbit(dx: number, dy: number) {
  const orbitSensitivity = 0.005;
  const orbitRadius = std.length(cameraPosition);
  const orbitYaw = Math.atan2(cameraPosition.x, cameraPosition.z) -
    dx * orbitSensitivity;
  const orbitPitch = std.clamp(
    Math.asin(cameraPosition.y / orbitRadius) + dy * orbitSensitivity,
    -(Math.PI / 2 - 0.01),
    Math.PI / 2 - 0.01,
  );
  // Convert spherical coordinates to cartesian coordinates
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);

  cameraPosition = d.vec3f(newCamX, newCamY, newCamZ);
  updateCameraPosition();
}

canvas.addEventListener('wheel', (event: WheelEvent) => {
  event.preventDefault();
  const zoomSensitivity = 0.05;
  const orbitRadius = std.length(cameraPosition);
  const orbitYaw = Math.atan2(cameraPosition.x, cameraPosition.z);
  const orbitPitch = Math.asin(cameraPosition.y / orbitRadius);
  const newCamRadius = std.clamp(
    std.length(cameraPosition) + event.deltaY * zoomSensitivity,
    10,
    500,
  );
  const newCamX = newCamRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = newCamRadius * Math.sin(orbitPitch);
  const newCamZ = newCamRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);

  cameraPosition = d.vec3f(newCamX, newCamY, newCamZ);
  updateCameraPosition();
});

canvas.addEventListener('mousedown', (event) => {
  isDragging = true;
  prevX = event.clientX;
  prevY = event.clientY;
});

canvas.addEventListener('touchstart', (event) => {
  if (event.touches.length === 1) {
    isDragging = true;
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;
  }
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

window.addEventListener('touchend', () => {
  isDragging = false;
});

window.addEventListener('mousemove', (event) => {
  const dx = event.clientX - prevX;
  const dy = event.clientY - prevY;
  prevX = event.clientX;
  prevY = event.clientY;

  if (isDragging) {
    updateCameraOrbit(dx, dy);
  }
});

canvas.addEventListener('touchmove', (event) => {
  if (isDragging && event.touches.length === 1) {
    event.preventDefault();
    const dx = event.touches[0].clientX - prevX;
    const dy = event.touches[0].clientY - prevY;
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;

    updateCameraOrbit(dx, dy);
  }
});

function hideHelp() {
  const helpElem = document.getElementById('help');
  if (helpElem) {
    helpElem.style.opacity = '0';
  }
}
for (const eventName of ['click', 'keydown', 'wheel', 'touchstart']) {
  window.addEventListener(eventName, hideHelp, { once: true });
}

export function onCleanup() {
  destroyed = true;
  resizeObserver.unobserve(canvas);
  root.destroy();
}

// #endregion

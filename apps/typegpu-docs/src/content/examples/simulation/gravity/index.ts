import tgpu, {
  type Render,
  type Sampled,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuBuffer,
  type TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import { computeCollisionsShader, computeGravityShader } from './compute.ts';
import {
  type Preset,
  collisionBehavior,
  presets,
  sphereTextureNames,
} from './enums.ts';
import { loadModel } from './load-model.ts';
import * as p from './params.ts';
import { examplePresets } from './presets.ts';
import {
  mainFragment,
  mainVertex,
  skyBoxFragment,
  skyBoxVertex,
} from './render.ts';
import {
  Camera,
  CelestialBody,
  SkyBoxVertex,
  computeCollisionsBindGroupLayout,
  computeGravityBindGroupLayout,
  renderBindGroupLayout,
  renderVertexLayout,
  skyBoxBindGroupLayout,
  skyBoxVertexLayout,
} from './schemas.ts';
import { loadSkyBox, loadSphereTextures, skyBoxVertices } from './textures.ts';

// AAA presety: atom, ziemia i księzyc, solar system,
// andromeda x milky way, balls on ground, negative mass
// AAA dynamic lighting source, lighting direction
// AAA camera starting position
// AAA suma (inny ticket)

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const root = await tgpu.init();
const device = root.device;
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// static resources (created on the example load)

const { vertexBuffer: sphereVertexBuffer, vertexCount: sphereVertexCount } =
  await loadModel(root, '/TypeGPU/assets/gravity/sphere.obj');

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const cameraInitial = Camera({
  position: p.cameraInitialPos.xyz,
  view: m.mat4.lookAt(
    p.cameraInitialPos,
    p.cameraTarget,
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
const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

const skyBoxVertexBuffer = root
  .createBuffer(d.arrayOf(SkyBoxVertex, skyBoxVertices.length), skyBoxVertices)
  .$usage('vertex');

const sphereTextures = await loadSphereTextures(root);

const celestialBodiesCountBuffer = root.createBuffer(d.i32).$usage('uniform');

const timeMultiplierBuffer = root.createBuffer(d.f32).$usage('uniform');

// dynamic resources (recreated every time a preset is selected)

interface DynamicResources {
  celestialBodiesCount: number;
  celestialBodiesBufferA: TgpuBuffer<d.WgslArray<typeof CelestialBody>> &
    StorageFlag;
  celestialBodiesBufferB: TgpuBuffer<d.WgslArray<typeof CelestialBody>> &
    StorageFlag;
  computeCollisionsBindGroup: TgpuBindGroup<
    (typeof computeCollisionsBindGroupLayout)['entries']
  >;
  computeGravityBindGroup: TgpuBindGroup<
    (typeof computeGravityBindGroupLayout)['entries']
  >;
  skyBoxTexture: TgpuTexture<{ size: [2048, 2048, 6]; format: 'rgba8unorm' }> &
    Render &
    Sampled;
  skyBoxBindGroup: TgpuBindGroup<(typeof skyBoxBindGroupLayout)['entries']>;
  renderBindGroup: TgpuBindGroup<(typeof renderBindGroupLayout)['entries']>;
}

const dynamicResourcesBox = {
  data: await loadPreset('Asteroids'),
};

// Pipelines
const computeGravityPipeline = root['~unstable']
  .withCompute(computeGravityShader)
  .createPipeline()
  .$name('compute gravity pipeline');

const computeCollisionsPipeline = root['~unstable']
  .withCompute(computeCollisionsShader)
  .createPipeline()
  .$name('compute collisions pipeline');

const skyBoxPipeline = root['~unstable']
  .withVertex(skyBoxVertex, skyBoxVertexLayout.attrib)
  .withFragment(skyBoxFragment, { format: presentationFormat })
  .withPrimitive({
    cullMode: 'front',
  })
  .createPipeline();

const renderPipeline = root['~unstable']
  .withVertex(mainVertex, renderVertexLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withPrimitive({ topology: 'triangle-list', cullMode: 'front' })
  .createPipeline();

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

function render() {
  computeCollisionsPipeline
    .with(
      computeCollisionsBindGroupLayout,
      dynamicResourcesBox.data.computeCollisionsBindGroup,
    )
    .dispatchWorkgroups(dynamicResourcesBox.data.celestialBodiesCount);

  computeGravityPipeline
    .with(
      computeGravityBindGroupLayout,
      dynamicResourcesBox.data.computeGravityBindGroup,
    )
    .dispatchWorkgroups(dynamicResourcesBox.data.celestialBodiesCount);

  skyBoxPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(skyBoxVertexLayout, skyBoxVertexBuffer)
    .with(renderBindGroupLayout, dynamicResourcesBox.data.renderBindGroup)
    .with(skyBoxBindGroupLayout, dynamicResourcesBox.data.skyBoxBindGroup)
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
    .draw(sphereVertexCount, dynamicResourcesBox.data.celestialBodiesCount);

  root['~unstable'].flush();
}

let destroyed = false;
// Frame loop
function frame() {
  if (destroyed) {
    return;
  }
  render();
  requestAnimationFrame(frame);
}
frame();

async function loadPreset(preset: Preset): Promise<DynamicResources> {
  const presetData = examplePresets[preset];

  const celestialBodies: d.Infer<typeof CelestialBody>[] =
    presetData.celestialBodies.flatMap((group) =>
      group.elements.map((element) => {
        return {
          destroyed: 0,
          position: element.position,
          velocity: element.velocity ?? d.vec3f(),
          mass: element.mass,
          radiusMultiplier: element.radiusMultiplier ?? 1,
          collisionBehavior: element.collisionBehavior
            ? collisionBehavior.indexOf(element.collisionBehavior)
            : 0,
          textureIndex: sphereTextureNames.indexOf(group.texture),
        };
      }),
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
    computeCollisionsBindGroupLayout,
    {
      celestialBodiesCount: celestialBodiesCountBuffer,
      inState: computeBufferA,
      outState: computeBufferB,
    },
  );

  const computeGravityBindGroup = root.createBindGroup(
    computeGravityBindGroupLayout,
    {
      celestialBodiesCount: celestialBodiesCountBuffer,
      timeMultiplier: timeMultiplierBuffer,
      inState: computeBufferB,
      outState: computeBufferA,
    },
  );

  celestialBodiesCountBuffer.write(celestialBodies.length);

  const renderBindGroup = root.createBindGroup(renderBindGroupLayout, {
    camera: cameraBuffer,
    sampler,
    celestialBodyTextures: sphereTextures,
    celestialBodies: computeBufferA,
  });

  const skyBoxTexture = await loadSkyBox(root, presetData.skyBox);
  const skyBox = skyBoxTexture.createView('sampled', { dimension: 'cube' });

  const textureBindGroup = root.createBindGroup(skyBoxBindGroupLayout, {
    camera: cameraBuffer,
    skyBox: skyBox,
    sampler: sampler,
  });

  return {
    celestialBodiesCount: celestialBodies.length,
    celestialBodiesBufferA: computeBufferA,
    celestialBodiesBufferB: computeBufferB,
    computeCollisionsBindGroup,
    computeGravityBindGroup,
    skyBoxTexture,
    skyBoxBindGroup: textureBindGroup,
    renderBindGroup,
  };
}

// #region Camera controls

export const controls = {
  preset: {
    initial: 'Asteroids',
    options: presets,
    async onSelectChange(value: Preset) {
      const oldData = dynamicResourcesBox.data;
      dynamicResourcesBox.data = await loadPreset(value);
      oldData.celestialBodiesBufferA.destroy();
      oldData.celestialBodiesBufferB.destroy();
      oldData.skyBoxTexture.destroy();
    },
  },
  'simulation speed modifier': {
    initial: 0,
    min: -3,
    max: 20,
    step: 1,
    onSliderChange: (newValue: number) => {
      timeMultiplierBuffer.write(2 ** newValue);
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

  cameraBuffer.writePartial({ projection: proj });
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
let orbitRadius = std.length(p.cameraInitialPos);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(p.cameraInitialPos.x, p.cameraInitialPos.z);
let orbitPitch = Math.asin(p.cameraInitialPos.y / orbitRadius);

function updateCameraOrbit(dx: number, dy: number) {
  const orbitSensitivity = 0.005;
  orbitYaw += -dx * orbitSensitivity;
  orbitPitch += dy * orbitSensitivity;
  // Clamp pitch to avoid flipping
  const maxPitch = Math.PI / 2 - 0.01;
  if (orbitPitch > maxPitch) orbitPitch = maxPitch;
  if (orbitPitch < -maxPitch) orbitPitch = -maxPitch;
  // Convert spherical coordinates to cartesian coordinates
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);

  const newView = m.mat4.lookAt(
    newCameraPos,
    d.vec3f(0, 0, 0),
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.writePartial({ view: newView, position: newCameraPos.xyz });
}

canvas.addEventListener('wheel', (event: WheelEvent) => {
  event.preventDefault();
  const zoomSensitivity = 0.05;
  orbitRadius = std.clamp(orbitRadius + event.deltaY * zoomSensitivity, 3, 200);
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);
  const newView = m.mat4.lookAt(
    newCameraPos,
    d.vec3f(0, 0, 0),
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.writePartial({ view: newView, position: newCameraPos.xyz });
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

canvas.addEventListener('mousemove', (event) => {
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

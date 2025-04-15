import tgpu, {
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuBuffer,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import { computeShader } from './compute.ts';
import { loadModel } from './load-model.ts';
import * as p from './params.ts';
import { type Preset, presets, presetsEnum } from './presets.ts';
import { mainFragment, mainVertex } from './render.ts';
import {
  Camera,
  CelestialBody,
  celestialBodiesBindGroupLayout,
  renderBindGroupLayout,
  renderInstanceLayout,
} from './schemas.ts';

// AAA większy canvas
// AAA presety: atom, ziemia i księzyc, oort cloud / planet ring, solar system,
// andromeda x milky way, particles, balls on ground, negative mass
// AAA skybox jak w endzie
// AAA speed slider
// AAA bufor z czasem
// AAA resize observer
// AAA model kuli
// AAA zderzenia
// AAA mobile touch support

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

// type texture = TgpuTexture<{
//   size: [number, number];
//   format: 'rgba8unorm';
// }> &
//   Sampled &
//   Render;

const { vertexBuffer, vertexCount } = await loadModel(
  root,
  '/TypeGPU/assets/gravity/sphere.obj',
);

const CelestialBodyMaxArray = (n: number) => d.arrayOf(CelestialBody, n);

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Camera
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

const cameraBindGroup = root.createBindGroup(renderBindGroupLayout, {
  camera: cameraBuffer,
  // cube: cubeBuffer,
  sampler,
});

const celestialBodiesCountBuffer = root.createBuffer(d.i32).$usage('uniform');

interface DynamicResources {
  celestialBodiesCount: number;
  flip: number;
  celestialBodiesBufferA: TgpuBuffer<d.WgslArray<typeof CelestialBody>> &
    StorageFlag;
  celestialBodiesBufferB: TgpuBuffer<d.WgslArray<typeof CelestialBody>> &
    StorageFlag;
  celestialBodiesBindGroupA: TgpuBindGroup<
    (typeof celestialBodiesBindGroupLayout)['entries']
  >;
  celestialBodiesBindGroupB: TgpuBindGroup<
    (typeof celestialBodiesBindGroupLayout)['entries']
  >;
}

const dynamicResourcesBox = {
  data: await loadPreset('Atom'),
};

// Pipelines
const computePipeline = root['~unstable']
  .withCompute(computeShader)
  .createPipeline()
  .$name('compute pipeline');

const renderPipeline = root['~unstable']
  .withVertex(mainVertex, renderInstanceLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withPrimitive({ topology: 'triangle-list', cullMode: 'front' })
  .createPipeline();

const depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

function render() {
  dynamicResourcesBox.data.flip = 1 - dynamicResourcesBox.data.flip;

  computePipeline
    .with(
      celestialBodiesBindGroupLayout,
      dynamicResourcesBox.data.flip === 1
        ? dynamicResourcesBox.data.celestialBodiesBindGroupA
        : dynamicResourcesBox.data.celestialBodiesBindGroupB,
    )
    .dispatchWorkgroups(dynamicResourcesBox.data.celestialBodiesCount); // count of celestial bodies

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: [0, 1, 0, 1], // background color
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(renderInstanceLayout, vertexBuffer)
    .with(renderBindGroupLayout, cameraBindGroup)
    .with(
      celestialBodiesBindGroupLayout,
      dynamicResourcesBox.data.flip === 1
        ? dynamicResourcesBox.data.celestialBodiesBindGroupA
        : dynamicResourcesBox.data.celestialBodiesBindGroupB,
    )
    .draw(vertexCount, dynamicResourcesBox.data.celestialBodiesCount);

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

function loadPreset(preset: Preset): DynamicResources {
  const presetData = presets[preset];

  const celestialBodies: d.Infer<typeof CelestialBody>[] =
    presetData.celestialBodies
      .flatMap((group) => group.elements)
      .map((element) => {
        return {
          modelTransformationMatrix: std.mul(element.radius, std.identity()),
          position: element.position,
          velocity: element.velocity,
          mass: element.mass,
          radius: element.radius,
        };
      });

  const computeBufferA = root
    .createBuffer(
      CelestialBodyMaxArray(celestialBodies.length),
      celestialBodies,
    )
    .$usage('storage');
  const computeBufferB = root
    .createBuffer(CelestialBodyMaxArray(celestialBodies.length))
    .$usage('storage');

  const celestialBodiesBindGroupA = root.createBindGroup(
    celestialBodiesBindGroupLayout,
    {
      celestialBodiesCount: celestialBodiesCountBuffer,
      inState: computeBufferA,
      outState: computeBufferB,
    },
  );

  const celestialBodiesBindGroupB = root.createBindGroup(
    celestialBodiesBindGroupLayout,
    {
      celestialBodiesCount: celestialBodiesCountBuffer,
      inState: computeBufferB,
      outState: computeBufferA,
    },
  );

  celestialBodiesCountBuffer.write(celestialBodies.length);

  return {
    flip: 0,
    celestialBodiesCount: celestialBodies.length,
    celestialBodiesBufferA: computeBufferA,
    celestialBodiesBufferB: computeBufferB,
    celestialBodiesBindGroupA,
    celestialBodiesBindGroupB,
  };
}

// #region Camera controls

export const controls = {
  Preset: {
    initial: presetsEnum[0],
    options: presetsEnum,
    onSelectChange: (value: Preset) => {
      const oldData = dynamicResourcesBox.data;
      // AAA dispose of the oldData
      dynamicResourcesBox.data = loadPreset(value);
    },
  },
};

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const dpr = window.devicePixelRatio;
    const width = entry.contentRect.width;
    const height = entry.contentRect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const newProj = m.mat4.perspective(
      Math.PI / 4,
      canvas.width / canvas.height,
      0.1,
      10000,
      d.mat4x4f(),
    );
    cameraBuffer.writePartial({ projection: newProj });
  }
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
  orbitRadius = std.clamp(orbitRadius + event.deltaY * zoomSensitivity, 3, 100);
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

window.addEventListener('mouseup', () => {
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

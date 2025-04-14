import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import { computeShader } from './compute.ts';
import { loadModel } from './load-model.ts';
import * as p from './params.ts';
import { mainFragment, mainVertex } from './render.ts';
import {
  Camera,
  CelestialBody,
  computeBindGroupLayout,
  renderBindGroupLayout,
  renderInstanceLayout,
} from './schemas.ts';

// AAA rotacja kamery poza ekranem
// AAA większy canvas
// AAA presety: atom, ziemia i księzyc, oort cloud / planet ring, solar system,
// andromeda x milky way, particles
// AAA skybox jak w endzie
// AAA speed slider

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

const { vertexBuffer } = await loadModel(
  root,
  '/TypeGPU/assets/gravity/cube_blend.obj',
  '/TypeGPU/assets/gravity/cube_texture.png',
);

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Camera
const cameraInitial = Camera({
  position: p.cameraInitialPos.xyz,
  view: m.mat4.lookAt(
    p.cameraInitialPos,
    p.target,
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

const CelestialBodyMaxArray = d.arrayOf(CelestialBody, 4);

const celestialBodiesBufferA = root
  .createBuffer(CelestialBodyMaxArray, [
    {
      modelTransformationMatrix: d.mat4x4f(),
      position: d.vec3f(1, 0, 0),
      velocity: d.vec3f(0, 1, 0),
      mass: 10,
    },
    {
      modelTransformationMatrix: d.mat4x4f(),
      position: d.vec3f(0, 1, 0),
      velocity: d.vec3f(0, -1, 0.002),
      mass: 10,
    },
  ])
  .$usage('storage');
const celestialBodiesBufferB = root
  .createBuffer(CelestialBodyMaxArray)
  .$usage('storage');

const celestialBodiesCountBuffer = root
  .createBuffer(d.i32, p.celestialBodiesCount)
  .$usage('uniform');

let flip = false;
const celestialBodiesBindGroupA = root.createBindGroup(computeBindGroupLayout, {
  celestialBodiesCount: celestialBodiesCountBuffer,
  inState: celestialBodiesBufferA,
  outState: celestialBodiesBufferB,
});

const celestialBodiesBindGroupB = root.createBindGroup(computeBindGroupLayout, {
  celestialBodiesCount: celestialBodiesCountBuffer,
  inState: celestialBodiesBufferB,
  outState: celestialBodiesBufferA,
});

// Pipelines
const computePipeline = root['~unstable']
  .withCompute(computeShader)
  .createPipeline()
  .$name('compute pipeline');

const renderPipeline = root['~unstable']
  .withVertex(mainVertex, renderInstanceLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
  .createPipeline();

function render() {
  flip = !flip;

  computePipeline
    .with(
      computeBindGroupLayout,
      flip ? celestialBodiesBindGroupA : celestialBodiesBindGroupB,
    )
    .dispatchWorkgroups(4); // count of celestial bodies

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: [0, 1, 0, 1], // background color
    })
    .with(renderInstanceLayout, vertexBuffer)
    .with(renderBindGroupLayout, cameraBindGroup)
    .with(
      computeBindGroupLayout,
      flip ? celestialBodiesBindGroupA : celestialBodiesBindGroupB,
    )
    .draw(36, 4);

  root['~unstable'].flush();
}

let destroyed = false;
// Frame loop
function frame() {
  if (destroyed) {
    return;
  }
  requestAnimationFrame(frame);
  render();
}

// #region Camera controls
// Variables for mouse interaction.
let isDragging = false;
let prevX = 0;
let prevY = 0;
let isRightDragging = false;
let rightPrevX = 0;
let rightPrevY = 0;
let orbitRadius = Math.sqrt(
  p.cameraInitialPos.x * p.cameraInitialPos.x +
    p.cameraInitialPos.y * p.cameraInitialPos.y +
    p.cameraInitialPos.z * p.cameraInitialPos.z,
);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(p.cameraInitialPos.x, p.cameraInitialPos.z);
let orbitPitch = Math.asin(p.cameraInitialPos.y / orbitRadius);

// Helper functions for updating transforms.
function updateCubesRotation(dx: number, dy: number) {
  const sensitivity = 0.003;
  const yaw = -dx * sensitivity;
  const pitch = -dy * sensitivity;
}

function updateCameraOrbit(dx: number, dy: number) {
  const orbitSensitivity = 0.01;
  orbitYaw += -dx * orbitSensitivity;
  orbitPitch += -dy * orbitSensitivity;
  // if we don't limit pitch, it would lead to flipping the camera which is disorienting.
  const maxPitch = Math.PI / 2 - 0.01;
  if (orbitPitch > maxPitch) orbitPitch = maxPitch;
  if (orbitPitch < -maxPitch) orbitPitch = -maxPitch;
  // basically converting spherical coordinates to cartesian.
  // like sampling points on a unit sphere and then scaling them by the radius.
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = -orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);
  // const newCameraPos = cameraInitialPos;

  const newView = m.mat4.lookAt(
    newCameraPos,
    p.target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.write({
    position: newCameraPos.xyz,
    view: newView,
    projection: cameraInitial.projection,
  });
}

canvas.addEventListener('wheel', (event: WheelEvent) => {
  event.preventDefault();
  const zoomSensitivity = 0.05;
  orbitRadius = Math.max(1, orbitRadius + event.deltaY * zoomSensitivity);
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);
  const newView = m.mat4.lookAt(
    newCameraPos,
    p.target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.write({
    position: newCameraPos.xyz,
    view: newView,
    projection: cameraInitial.projection,
  });
});

canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0) {
    // Left Mouse Button controls Camera Orbit.
    isRightDragging = true;
    rightPrevX = event.clientX;
    rightPrevY = event.clientY;
  } else if (event.button === 2) {
    // Right Mouse Button controls Cube Rotation.
    isDragging = true;
    prevX = event.clientX;
    prevY = event.clientY;
  }
});

canvas.addEventListener('mouseup', (event) => {
  if (event.button === 0) {
    isRightDragging = false;
  } else if (event.button === 2) {
    isDragging = false;
  }
});

canvas.addEventListener('mousemove', (event) => {
  if (isDragging) {
    const dx = event.clientX - prevX;
    const dy = event.clientY - prevY;
    prevX = event.clientX;
    prevY = event.clientY;
    updateCubesRotation(dx, dy);
  }
  if (isRightDragging) {
    const dx = event.clientX - rightPrevX;
    const dy = event.clientY - rightPrevY;
    rightPrevX = event.clientX;
    rightPrevY = event.clientY;
    updateCameraOrbit(dx, dy);
  }
});

// Mobile touch support.
canvas.addEventListener('touchstart', (event: TouchEvent) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    // Single touch controls Camera Orbit.
    isRightDragging = true;
    rightPrevX = event.touches[0].clientX;
    rightPrevY = event.touches[0].clientY;
  } else if (event.touches.length === 2) {
    // Two-finger touch controls Cube Rotation.
    isDragging = true;
    // Use the first touch for rotation.
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;
  }
});

canvas.addEventListener('touchmove', (event: TouchEvent) => {
  event.preventDefault();
  if (isRightDragging && event.touches.length === 1) {
    const touch = event.touches[0];
    const dx = touch.clientX - rightPrevX;
    const dy = touch.clientY - rightPrevY;
    rightPrevX = touch.clientX;
    rightPrevY = touch.clientY;
    updateCameraOrbit(dx, dy);
  }
  if (isDragging && event.touches.length === 2) {
    const touch = event.touches[0];
    const dx = touch.clientX - prevX;
    const dy = touch.clientY - prevY;
    prevX = touch.clientX;
    prevY = touch.clientY;
    updateCubesRotation(dx, dy);
  }
});

canvas.addEventListener('touchend', (event: TouchEvent) => {
  event.preventDefault();
  if (event.touches.length === 0) {
    isRightDragging = false;
    isDragging = false;
  }
});

frame();

export function onCleanup() {
  destroyed = true;
  root.destroy();
}

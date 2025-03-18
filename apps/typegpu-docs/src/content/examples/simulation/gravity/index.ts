import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import { mainFragment, mainVertex } from './main-shaders';
import { cubeModel, vertices } from './cube';
import { cameraInitialPos, cubePos, cubeVelocity, G, target } from './env';
import { bindGroupLayout, CameraStruct, centerObjectbindGroupLayout, ObjectStruct, VertexStruct, CelectialBodyStruct } from './structs';


const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(VertexStruct, n));
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

// const cubeTexture = root['~unstable']
//   .createTexture({
//     size: [imageBitmap.width, imageBitmap.height],
//     format: 'rgba8unorm',
//   })
//   .$usage('sampled', 'render');
// device.queue.copyExternalImageToTexture(
//   { source: imageBitmap },
//   { texture: root.unwrap(cubeTexture) },
//   [imageBitmap.width, imageBitmap.height],
// );

const vertexBuffer = root
  .createBuffer(
    vertexLayout.schemaForCount(cubeModel.attributes.POSITION.value.length / 3),
  )
  .$usage('vertex')
  .$name('vertex');
  vertexBuffer.write(vertices);
console.log(cubeModel.attributes);

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Camera
const cameraInitial = CameraStruct({
  position: cameraInitialPos.xyz,
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    d.mat4x4f(),
  ),
});
const cameraBuffer = root.createBuffer(CameraStruct, cameraInitial).$usage('uniform');


let lastTime = performance.now();
const cubeModelMatrix = d.mat4x4f();
m.mat4.identity(cubeModelMatrix);
m.mat4.translate(cubeModelMatrix, d.vec3f(cubePos.x, cubePos.y, cubePos.z), cubeModelMatrix);

export const centerObjectBuffer = root.createBuffer(ObjectStruct, {
  modelMatrix: cubeModelMatrix,
}).$usage('uniform');

const centerObjectBindGroup = root.createBindGroup(centerObjectbindGroupLayout, {
  object: centerObjectBuffer,
});

const cameraBindGroup = root.createBindGroup(bindGroupLayout, {
  camera: cameraBuffer,
  // cube: cubeBuffer,
  sampler,
});

const celestialBodiesBufferA = root.createBuffer(d.arrayOf(CelectialBodyStruct, 1), [{
  position: d.vec3f(0, 0, 0),
  velocity: d.vec3f(0, 0, 0),
  mass: 1,
}]).$usage('uniform');
const celestialBodiesBufferB = root.createBuffer(d.arrayOf(CelectialBodyStruct, 1), [{
  position: d.vec3f(0, 0, 0),
  velocity: d.vec3f(0, 0, 0),
  mass: 1,
}]).$usage('uniform');

// biome-ignore lint/style/useConst: <explanation>
let flip = false;

// Render pipeline
const renderPipeline = root['~unstable']
  .withVertex(mainVertex, vertexLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
  .createPipeline();

function render() {
  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: [1, 1, 1, 1],
    })
    .with(vertexLayout, vertexBuffer)
    .with(bindGroupLayout, cameraBindGroup)
    .with(centerObjectbindGroupLayout, centerObjectBindGroup)
    .draw(36);

  root['~unstable'].flush();
}

console.log('Cube position:', await vertexBuffer.read());

let destroyed = false;

function updateCubePhysics() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const dist = Math.hypot(cubePos.x, cubePos.y, cubePos.z);
  const normDir = dist ? { x: cubePos.x / dist, y: cubePos.y / dist, z: cubePos.z / dist } : { x: 0, y: 0, z: 0 };

  for (const axis of ['x', 'y', 'z'] as const) {
    cubeVelocity[axis] += -G * normDir[axis] * dt;
    cubePos[axis] += cubeVelocity[axis] * dt;
    cubeVelocity[axis] *= 0.99;
  }

  console.log('Cube position:', cubePos);
  console.log('Cube velocity:', cubeVelocity);

  m.mat4.identity(cubeModelMatrix);
  m.mat4.translate(cubeModelMatrix, d.vec3f(cubePos.x, cubePos.y, cubePos.z), cubeModelMatrix);
  centerObjectBuffer.write({ modelMatrix: cubeModelMatrix });
}

// Frame loop
function frame() {
  if (destroyed) {
    return;
  }
  requestAnimationFrame(frame);
  updateCubePhysics();
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
  cameraInitialPos.x * cameraInitialPos.x +
    cameraInitialPos.y * cameraInitialPos.y +
    cameraInitialPos.z * cameraInitialPos.z,
);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(cameraInitialPos.x, cameraInitialPos.z);
let orbitPitch = Math.asin(cameraInitialPos.y / orbitRadius);

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
    target,
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
    target,
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
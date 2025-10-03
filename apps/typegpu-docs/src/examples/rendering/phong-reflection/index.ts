import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import * as p from './params.ts';
import { Camera, modelVertexLayout, renderBindGroupLayout } from './schemas.ts';
import { fragmentShader, vertexShader } from './render.ts';
import { loadModel } from './load-model.ts';

// ----

// setup
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// models and textures

// https://sketchfab.com/3d-models/animated-low-poly-fish-64adc2e5a4be471e8279532b9610c878
const fishModel = await loadModel(root, '/TypeGPU/assets/3d-fish/fish.obj');

// buffers

const camera = {
  position: p.cameraInitialPosition,
  targetPos: p.cameraInitialTarget,
  view: m.mat4.lookAt(
    p.cameraInitialPosition,
    p.cameraInitialTarget,
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
};

const cameraBuffer = root.createBuffer(Camera, camera).$usage('uniform');

// pipelines

const renderPipeline = root['~unstable']
  .withVertex(vertexShader, modelVertexLayout.attrib)
  .withFragment(fragmentShader, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withPrimitive({ topology: 'triangle-list' })
  .createPipeline();

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// bind groups

const renderFishBindGroup = root.createBindGroup(renderBindGroupLayout, {
  camera: cameraBuffer,
});

// frame

let disposed = false;

function frame() {
  if (disposed) {
    return;
  }

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [
        p.backgroundColor.x,
        p.backgroundColor.y,
        p.backgroundColor.z,
        1,
      ],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(modelVertexLayout, fishModel.vertexBuffer)
    .with(renderBindGroupLayout, renderFishBindGroup)
    .draw(fishModel.polygonCount);

  root['~unstable'].flush();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ----

// #region Example controls and cleanup

const resizeObserver = new ResizeObserver(() => {
  camera.projection = m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    d.mat4x4f(),
  );

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
let orbitRadius = std.length(p.cameraInitialPosition);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(p.cameraInitialPosition.x, p.cameraInitialPosition.z);
let orbitPitch = Math.asin(p.cameraInitialPosition.y / orbitRadius);

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
  cameraBuffer.writePartial({ view: newView, position: newCameraPos });
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
  cameraBuffer.writePartial({ view: newView, position: newCameraPos });
}, { passive: false });

canvas.addEventListener('mousedown', (event) => {
  isDragging = true;
  prevX = event.clientX;
  prevY = event.clientY;
});

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    isDragging = true;
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;
  }
}, { passive: false });

const mouseUpEventListener = () => {
  isDragging = false;
};
window.addEventListener('mouseup', mouseUpEventListener);

const touchEndEventListener = () => {
  isDragging = false;
};
window.addEventListener('touchend', touchEndEventListener);

const mouseMoveEventListener = (event: MouseEvent) => {
  const dx = event.clientX - prevX;
  const dy = event.clientY - prevY;
  prevX = event.clientX;
  prevY = event.clientY;

  if (isDragging) {
    updateCameraOrbit(dx, dy);
  }
};
window.addEventListener('mousemove', mouseMoveEventListener);

const touchMoveEventListener = (event: TouchEvent) => {
  if (isDragging && event.touches.length === 1) {
    event.preventDefault();
    const dx = event.touches[0].clientX - prevX;
    const dy = event.touches[0].clientY - prevY;
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;

    updateCameraOrbit(dx, dy);
  }
};
window.addEventListener('touchmove', touchMoveEventListener, {
  passive: false,
});

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
  window.removeEventListener('mouseup', mouseUpEventListener);
  window.removeEventListener('mousemove', mouseMoveEventListener);
  window.removeEventListener('touchmove', touchMoveEventListener);
  window.removeEventListener('touchend', touchEndEventListener);
  resizeObserver.unobserve(canvas);
  root.destroy();
}

// #endregion

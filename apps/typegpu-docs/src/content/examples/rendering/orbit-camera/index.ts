import tgpu, {
  type TgpuBuffer,
  type TgpuBindGroup,
  type VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

// Initialization

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const helpInfo = document.getElementById('help') as HTMLDivElement;

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// Data Structures

const Vertex = d.struct({
  position: d.vec4f,
  color: d.vec4f,
});

const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

const Transform = d.struct({
  model: d.mat4x4f,
});

const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(Vertex, n));

// Scene Setup

const aspect = canvas.clientWidth / canvas.clientHeight;
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(12, 5, 12, 1);

const cameraInitial = {
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()),
};

// Geometry Creation

function getColor(): d.Infer<typeof Vertex>['color'] {
  return d.vec4f(Math.random(), Math.random(), Math.random(), 1);
}

function createFace(vertices: number[][]): d.Infer<typeof Vertex>[] {
  return vertices.map((pos) => ({
    position: d.vec4f(...(pos as [number, number, number, number])),
    color: getColor(),
  }));
}

function createCube(): d.Infer<typeof Vertex>[] {
  const front = createFace([
    [-1, -1, 1, 1],
    [1, -1, 1, 1],
    [1, 1, 1, 1],
    [-1, -1, 1, 1],
    [1, 1, 1, 1],
    [-1, 1, 1, 1],
  ]);
  const back = createFace([
    [-1, -1, -1, 1],
    [-1, 1, -1, 1],
    [1, -1, -1, 1],
    [1, -1, -1, 1],
    [-1, 1, -1, 1],
    [1, 1, -1, 1],
  ]);
  const top = createFace([
    [-1, 1, -1, 1],
    [-1, 1, 1, 1],
    [1, 1, -1, 1],
    [1, 1, -1, 1],
    [-1, 1, 1, 1],
    [1, 1, 1, 1],
  ]);
  const bottom = createFace([
    [-1, -1, -1, 1],
    [1, -1, -1, 1],
    [-1, -1, 1, 1],
    [1, -1, -1, 1],
    [1, -1, 1, 1],
    [-1, -1, 1, 1],
  ]);
  const right = createFace([
    [1, -1, -1, 1],
    [1, 1, -1, 1],
    [1, -1, 1, 1],
    [1, -1, 1, 1],
    [1, 1, -1, 1],
    [1, 1, 1, 1],
  ]);
  const left = createFace([
    [-1, -1, -1, 1],
    [-1, -1, 1, 1],
    [-1, 1, -1, 1],
    [-1, -1, 1, 1],
    [-1, 1, 1, 1],
    [-1, 1, -1, 1],
  ]);
  return [...front, ...back, ...top, ...bottom, ...right, ...left];
}

function createPlane(): d.Infer<typeof Vertex>[] {
  return createFace([
    [-1, 0, 1, 1],
    [1, 0, 1, 1],
    [1, 0, -1, 1],
    [-1, 0, 1, 1],
    [1, 0, -1, 1],
    [-1, 0, -1, 1],
  ]);
}

// Transform Helpers

function getCubeTransform(translation: d.v3f, rotation: d.m4x4f) {
  return m.mat4.mul(
    m.mat4.translate(m.mat4.identity(d.mat4x4f()), translation, d.mat4x4f()),
    rotation,
    d.mat4x4f(),
  );
}

function getPlaneTransform(translation: d.v3f, scale: d.v3f) {
  return m.mat4.scale(
    m.mat4.translate(m.mat4.identity(d.mat4x4f()), translation, d.mat4x4f()),
    scale,
    d.mat4x4f(),
  );
}

// Buffers and Bind Groups

const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

const [cubeBuffer, secondCubeBuffer] = [createCube(), createCube()].map(
  (cube) =>
    root.createBuffer(vertexLayout.schemaForCount(36), cube).$usage('vertex'),
);

const [transformBuffer, secondTransformBuffer] = [
  d.vec3f(-2, 0, 0), // initial translation for the first cube
  d.vec3f(2, 0, 0), // initial translation for the second cube
].map((translation) =>
  root
    .createBuffer(Transform, {
      model: getCubeTransform(translation, m.mat4.identity(d.mat4x4f())),
    })
    .$usage('uniform'),
);

const planeBuffer = root
  .createBuffer(vertexLayout.schemaForCount(6), createPlane())
  .$usage('vertex');
const planeTransformBuffer = root
  .createBuffer(Transform, {
    model: getPlaneTransform(d.vec3f(0, -2, 0), d.vec3f(5, 1, 5)),
  })
  .$usage('uniform');

const bindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  transform: { uniform: Transform },
});
const { camera, transform } = bindGroupLayout.bound;

const bindGroup = root.createBindGroup(bindGroupLayout, {
  camera: cameraBuffer,
  transform: transformBuffer,
});
const secondBindGroup = root.createBindGroup(bindGroupLayout, {
  camera: cameraBuffer,
  transform: secondTransformBuffer,
});
const planeBindGroup = root.createBindGroup(bindGroupLayout, {
  camera: cameraBuffer,
  transform: planeTransformBuffer,
});

// Textures

let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let msaaTexture: GPUTexture;
let msaaTextureView: GPUTextureView;

function createDepthAndMsaaTextures() {
  if (depthTexture) {
    depthTexture.destroy();
  }
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'depth24plus',
    sampleCount: 4,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  depthTextureView = depthTexture.createView();

  if (msaaTexture) {
    msaaTexture.destroy();
  }
  msaaTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: presentationFormat,
    sampleCount: 4,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  msaaTextureView = msaaTexture.createView();
}
createDepthAndMsaaTextures();

// Shaders and Pipeline

const vertex = tgpu['~unstable']
  .vertexFn({
    in: { position: d.vec4f, color: d.vec4f },
    out: { pos: d.builtin.position, color: d.vec4f },
  })
  .does((input) => {
    const pos = std.mul(
      camera.value.projection,
      std.mul(
        camera.value.view,
        std.mul(transform.value.model, input.position),
      ),
    );
    return { pos, color: input.color };
  });

const fragment = tgpu['~unstable']
  .fragmentFn({
    in: { color: d.vec4f },
    out: d.vec4f,
  })
  .does((input) => input.color);

const pipeline = root['~unstable']
  .withVertex(vertex, vertexLayout.attrib)
  .withFragment(fragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withMultisample({
    count: 4,
  })
  .createPipeline();

// Render Loop

function drawObject(
  buffer: TgpuBuffer<d.WgslArray<typeof Vertex>> & VertexFlag,
  group: TgpuBindGroup<typeof bindGroupLayout.entries>,
  vertexCount: number,
  loadOp: 'clear' | 'load',
) {
  pipeline
    .withColorAttachment({
      view: msaaTextureView,
      resolveTarget: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: loadOp,
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTextureView,
      depthClearValue: 1,
      depthLoadOp: loadOp,
      depthStoreOp: 'store',
    })
    .with(vertexLayout, buffer)
    .with(bindGroupLayout, group)
    .draw(vertexCount);
}

let disposed = false;

function render() {
  if (disposed) {
    return;
  }

  drawObject(cubeBuffer, bindGroup, 36, 'clear');
  drawObject(secondCubeBuffer, secondBindGroup, 36, 'load');
  drawObject(planeBuffer, planeBindGroup, 6, 'load');
  root['~unstable'].flush();
}

function frame() {
  requestAnimationFrame(frame);
  render();
}

frame();

// #region Example controls and cleanup

// Variables for mouse interaction.
let isRightDragging = false;
let isDragging = false;
let prevX = 0;
let prevY = 0;
let orbitRadius = Math.sqrt(
  cameraInitialPos.x * cameraInitialPos.x +
    cameraInitialPos.y * cameraInitialPos.y +
    cameraInitialPos.z * cameraInitialPos.z,
);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(cameraInitialPos.x, cameraInitialPos.z);
let orbitPitch = Math.asin(cameraInitialPos.y / orbitRadius);
let cube1Rotation = m.mat4.identity(d.mat4x4f());
let cube2Rotation = m.mat4.identity(d.mat4x4f());

// Helper functions for updating transforms.
function updateCubesRotation(dx: number, dy: number) {
  const sensitivity = 0.003;
  const yaw = -dx * sensitivity;
  const pitch = -dy * sensitivity;
  const yawMatrix = m.mat4.rotateY(
    m.mat4.identity(d.mat4x4f()),
    yaw,
    d.mat4x4f(),
  );
  const pitchMatrix = m.mat4.rotateX(
    m.mat4.identity(d.mat4x4f()),
    pitch,
    d.mat4x4f(),
  );
  const deltaRotation = m.mat4.mul(yawMatrix, pitchMatrix, d.mat4x4f());
  cube1Rotation = m.mat4.mul(deltaRotation, cube1Rotation, d.mat4x4f());
  cube2Rotation = m.mat4.mul(deltaRotation, cube2Rotation, d.mat4x4f());
  const cube1Transform = getCubeTransform(d.vec3f(-2, 0, 0), cube1Rotation);
  const cube2Transform = getCubeTransform(d.vec3f(2, 0, 0), cube2Rotation);
  transformBuffer.write({ model: cube1Transform });
  secondTransformBuffer.write({ model: cube2Transform });
}

function updateCameraOrbit(dx: number, dy: number) {
  const orbitSensitivity = 0.005;
  orbitYaw += -dx * orbitSensitivity;
  orbitPitch += dy * orbitSensitivity;
  // if we didn't limit pitch, it would lead to flipping the camera which is disorienting.
  const maxPitch = Math.PI / 2 - 0.01;
  if (orbitPitch > maxPitch) orbitPitch = maxPitch;
  if (orbitPitch < -maxPitch) orbitPitch = -maxPitch;
  // basically converting spherical coordinates to cartesian.
  // like sampling points on a unit sphere and then scaling them by the radius.
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
  cameraBuffer.write({ view: newView, projection: cameraInitial.projection });
}

// Prevent the context menu from appearing on right click.
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

canvas.addEventListener('mouseover', () => {
  helpInfo.style.opacity = '0';
});
canvas.addEventListener('mouseout', () => {
  helpInfo.style.opacity = '1';
});
// handle mobile devices
canvas.addEventListener('touchstart', () => {
  helpInfo.style.opacity = '0';
});
canvas.addEventListener('touchend', () => {
  helpInfo.style.opacity = '1';
});

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
  cameraBuffer.writePartial({ view: newView });
});

canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0) {
    // Left Mouse Button controls Camera Orbit.
    isDragging = true;
  } else if (event.button === 2) {
    // Right Mouse Button controls Cube Rotation.
    isRightDragging = true;
  }
  prevX = event.clientX;
  prevY = event.clientY;
});

window.addEventListener('mouseup', () => {
  isRightDragging = false;
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
  if (isRightDragging) {
    updateCubesRotation(dx, dy);
  }
});

// Mobile touch support.
canvas.addEventListener('touchstart', (event: TouchEvent) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    // Single touch controls Camera Orbit.
    isDragging = true;
  } else if (event.touches.length === 2) {
    // Two-finger touch controls Cube Rotation.
    isRightDragging = true;
  }
  // Use the first touch for rotation.
  prevX = event.touches[0].clientX;
  prevY = event.touches[0].clientY;
});

canvas.addEventListener('touchmove', (event: TouchEvent) => {
  event.preventDefault();
  const touch = event.touches[0];
  const dx = touch.clientX - prevX;
  const dy = touch.clientY - prevY;
  prevX = touch.clientX;
  prevY = touch.clientY;

  if (isDragging && event.touches.length === 1) {
    updateCameraOrbit(dx, dy);
  }
  if (isRightDragging && event.touches.length === 2) {
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

const resizeObserver = new ResizeObserver(() => {
  createDepthAndMsaaTextures();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  disposed = true;
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion

import type {
  RenderFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuTexture,
  VertexFlag,
} from 'typegpu';
import tgpu, { d, std } from 'typegpu';
import * as m from 'wgpu-matrix';

// Initialization

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const helpInfo = document.getElementById('help') as HTMLDivElement;

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

const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));

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
    .$usage('uniform')
);

const planeBuffer = root
  .createBuffer(vertexLayout.schemaForCount(6), createPlane())
  .$usage('vertex');
const planeTransformBuffer = root
  .createBuffer(Transform, {
    model: getPlaneTransform(d.vec3f(0, -2, 0), d.vec3f(5, 1, 5)),
  })
  .$usage('uniform');

const layout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  transform: { uniform: Transform },
});

const bindGroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: transformBuffer,
});
const secondBindGroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: secondTransformBuffer,
});
const planeBindGroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: planeTransformBuffer,
});

// Textures

let depthTexture:
  & TgpuTexture<{
    size: [number, number];
    format: 'depth24plus';
    sampleCount: 4;
  }>
  & RenderFlag;
let msaaTexture:
  & TgpuTexture<{
    size: [number, number];
    format: typeof presentationFormat;
    sampleCount: 4;
  }>
  & RenderFlag;

function createDepthAndMsaaTextures() {
  if (depthTexture) {
    depthTexture.destroy();
  }
  depthTexture = root['~unstable'].createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    sampleCount: 4,
  }).$usage('render');

  if (msaaTexture) {
    msaaTexture.destroy();
  }
  msaaTexture = root['~unstable'].createTexture({
    size: [canvas.width, canvas.height],
    format: presentationFormat,
    sampleCount: 4,
  }).$usage('render');
}
createDepthAndMsaaTextures();

// Shaders and Pipeline

const vertex = tgpu.vertexFn({
  in: { position: d.vec4f, color: d.vec4f },
  out: { pos: d.builtin.position, color: d.vec4f },
})((input) => {
  const pos = std.mul(
    layout.$.camera.projection,
    std.mul(
      layout.$.camera.view,
      std.mul(layout.$.transform.model, input.position),
    ),
  );
  return { pos, color: input.color };
});

const fragment = tgpu.fragmentFn({
  in: { color: d.vec4f },
  out: d.vec4f,
})((input) => input.color);

const pipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex,
  fragment,

  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
  multisample: {
    count: 4,
  },
});

// Render Loop

function drawObject(
  buffer: TgpuBuffer<d.WgslArray<typeof Vertex>> & VertexFlag,
  group: TgpuBindGroup<typeof layout.entries>,
  vertexCount: number,
  loadOp: 'clear' | 'load',
) {
  pipeline
    .withColorAttachment({
      view: msaaTexture,
      resolveTarget: context,
      loadOp: loadOp,
    })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: loadOp,
      depthStoreOp: 'store',
    })
    .with(vertexLayout, buffer)
    .with(group)
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
let lastPinchDist = 0;
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

function updateCameraPosition() {
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

function updateCameraOrbit(dx: number, dy: number) {
  orbitYaw += -dx * 0.005;
  orbitPitch = Math.max(
    -Math.PI / 2 + 0.01,
    Math.min(Math.PI / 2 - 0.01, orbitPitch + dy * 0.005),
  );
  updateCameraPosition();
}

function zoomCamera(delta: number) {
  orbitRadius = Math.max(1, orbitRadius + delta);
  updateCameraPosition();
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
}, { passive: true });
canvas.addEventListener('touchend', () => {
  helpInfo.style.opacity = '1';
});

canvas.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  zoomCamera(e.deltaY * 0.05);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isDragging = true;
  } else if (e.button === 2) {
    isRightDragging = true;
  }
  prevX = e.clientX;
  prevY = e.clientY;
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    isDragging = true;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    isDragging = false;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastPinchDist = Math.sqrt(dx * dx + dy * dy);
  }
}, { passive: false });

const mouseUpEventListener = () => {
  isRightDragging = false;
  isDragging = false;
};
window.addEventListener('mouseup', mouseUpEventListener);

const touchEndEventListener = () => {
  isDragging = false;
};
window.addEventListener('touchend', touchEndEventListener);

const mouseMoveEventListener = (e: MouseEvent) => {
  const dx = e.clientX - prevX;
  const dy = e.clientY - prevY;
  prevX = e.clientX;
  prevY = e.clientY;

  if (isDragging) {
    updateCameraOrbit(dx, dy);
  }
  if (isRightDragging) {
    updateCubesRotation(dx, dy);
  }
};
window.addEventListener('mousemove', mouseMoveEventListener);

const touchMoveEventListener = (e: TouchEvent) => {
  if (e.touches.length === 1 && isDragging) {
    e.preventDefault();
    const dx = e.touches[0].clientX - prevX;
    const dy = e.touches[0].clientY - prevY;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
    updateCameraOrbit(dx, dy);
  }
};
window.addEventListener('touchmove', touchMoveEventListener, {
  passive: false,
});

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const pinchDist = Math.sqrt(dx * dx + dy * dy);
    zoomCamera((lastPinchDist - pinchDist) * 0.05);
    lastPinchDist = pinchDist;
  }
}, { passive: false });

const resizeObserver = new ResizeObserver(() => {
  createDepthAndMsaaTextures();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  disposed = true;
  window.removeEventListener('mouseup', mouseUpEventListener);
  window.removeEventListener('mousemove', mouseMoveEventListener);
  window.removeEventListener('touchend', touchEndEventListener);
  window.removeEventListener('touchmove', touchMoveEventListener);
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion

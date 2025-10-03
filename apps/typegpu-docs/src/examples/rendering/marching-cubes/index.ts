import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import * as p from './params.ts';
import { Camera, modelVertexLayout, renderBindGroupLayout } from './schemas.ts';
import { fragmentShader, vertexShader } from './render.ts';
import { loadModel } from './load-model.ts';
import { perlin3d, randf } from '@typegpu/noise';
import { edgeTable, edgeToVertices, triangleTable } from './tables';
import { SIZE } from './params.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = 'rgba16float';

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const terrainTexture = root['~unstable'].createTexture({
  size: [SIZE, SIZE, SIZE],
  format: presentationFormat,
  dimension: '3d',
}).$usage('sampled', 'render', 'storage');

// fill texture with noise

const fillBindGroupLayout = tgpu.bindGroupLayout({
  terrain: { storageTexture: d.textureStorage3d('rgba16float', 'write-only') },
});

const fillBindGroup = root.createBindGroup(fillBindGroupLayout, {
  terrain: terrainTexture,
});

prepareDispatch(root, (x, y, z) => {
  'kernel';
  // const level =
  //   std.distance(d.vec3f(x, y, z), d.vec3f(SIZE / 2, SIZE / 2, SIZE / 2)) /
  //   SIZE / 0.5;
  // randf.seed(x * SIZE * SIZE + y * SIZE + z);
  // const level = randf.sample();
  let level = d.f32(y) / SIZE - 0.3;
  for (let i = 0; i < 4; i++) {
    const mult = 3 * d.f32(2 ** i);
    level += perlin3d.sample(d.vec3f(x, y, z).div(SIZE).mul(mult)) / mult;
  }
  std.textureStore(
    fillBindGroupLayout.$.terrain,
    d.vec3u(x, y, z),
    d.vec4f(level, 0, 0, 0),
  );
})
  .with(fillBindGroupLayout, fillBindGroup)
  .dispatch(SIZE, SIZE, SIZE);

// --- generate triangles ---

const Point = d.vec3f;
const Triangle = d.struct({ points: d.arrayOf(Point, 3), normal: d.vec3f });
const CellTriangles = d.struct({
  count: d.u32,
  triangles: d.arrayOf(Triangle, 4),
});

const indexMutable = root.createMutable(d.atomic(d.u32), 0);
const trianglesMutable = root.createMutable(
  d.arrayOf(Triangle, 4 * ((SIZE - 1) ** 3)),
);

const generateBindGroupLayout = tgpu.bindGroupLayout({
  terrain: { storageTexture: d.textureStorage3d('rgba16float', 'read-only') },
});

const generateBindGroup = root.createBindGroup(generateBindGroupLayout, {
  terrain: terrainTexture,
});

const GridCell = d.struct({
  vertex: d.arrayOf(Point, 8),
  value: d.arrayOf(d.f32, 8),
});

/**
 * Given a `cell`, calculate its cube index
 * The cube index is an 8-bit encoding. Each bit represents a vertex. `index[i]` is the ith bit
 * If the value at the ith vertex is < isovalue, `index[i]` = 1. Else, `index[i]` = 0
 */
const calculateCubeIndex = tgpu.fn([GridCell, d.f32], d.u32)(
  (cell, isoValue) => {
    'kernel';
    let cubeIndex = d.u32(0);
    for (let i = d.u32(0); i < 8; i++) {
      if (cell.value[i] < isoValue) {
        cubeIndex |= d.u32(d.i32(1 << i));
      }
    }
    return cubeIndex;
  },
);

// Find the point between `v1` and `v2` where the functional value = `isovalue`
const interpolate = tgpu.fn([Point, d.f32, Point, d.f32, d.f32], Point)(
  (v1, val1, v2, val2, isoValue) => {
    'kernel';
    const interpolated = Point();
    const mu = (isoValue - val1) / (val2 - val1);

    interpolated.x = mu * (v2.x - v1.x) + v1.x;
    interpolated.y = mu * (v2.y - v1.y) + v1.y;
    interpolated.z = mu * (v2.z - v1.z) + v1.z;

    return interpolated;
  },
);

// Returns all intersection coordinates of a cell with the isosurface
// (Calls `interpolate()`)
const getIntersectionCoordinates = tgpu.fn(
  [GridCell, d.f32],
  d.arrayOf(Point, 12),
)((cell, isoValue) => {
  'kernel';
  const intersections = d.arrayOf(Point, 12)();
  const cubeIndex = calculateCubeIndex(cell, isoValue);

  let intersectionsKey = edgeTable.$[cubeIndex];
  let idx = 0;
  while (intersectionsKey) {
    if (intersectionsKey & 1) {
      const v1 = edgeToVertices.$[idx][0];
      const v2 = edgeToVertices.$[idx][1];
      const intersectionPoint = interpolate(
        cell.vertex[v1],
        cell.value[v1],
        cell.vertex[v2],
        cell.value[v2],
        isoValue,
      );
      intersections[idx] = intersectionPoint;
    }
    idx++;
    intersectionsKey >>= 1;
  }

  return intersections;
});

const calculateNormal = tgpu.fn([d.arrayOf(Point, 3)], d.vec3f)((points) => {
  const e1 = points[1].sub(points[0]);
  const e2 = points[2].sub(points[0]);
  const n = std.cross(d.vec3f(e1.x, e1.y, e1.z), d.vec3f(e2.x, e2.y, e2.z));
  return std.normalize(n);
});

// Given `cubeIndex`, get the edge table entry and using `intersections`, make all triangles
const getTriangles = tgpu.fn(
  [d.arrayOf(Point, 12), d.u32],
  CellTriangles,
)((intersections, cubeIndex) => {
  'kernel';
  const triangles = d.arrayOf(Triangle, 4)();
  let count = 0;
  for (let i = 0; triangleTable.$[cubeIndex][i] != -1; i += 3) {
    const triangle = Triangle();
    for (let j = 0; j < 3; j++) {
      triangle.points[j] = intersections[triangleTable.$[cubeIndex][i + j]];
    }
    triangle.normal = calculateNormal(triangle.points);
    triangles[count] = triangle;
    count += 1;
  }

  return { count, triangles };
});

// Get triangles of a single cell
const triangulateCell = tgpu.fn([GridCell, d.f32], CellTriangles)(
  (cell, isoValue) => {
    'kernel';
    const cubeIndex = calculateCubeIndex(cell, isoValue);
    const intersections = getIntersectionCoordinates(cell, isoValue);
    const triangles = getTriangles(intersections, cubeIndex);

    return triangles;
  },
);

// Triangulate a scalar field represented by `scalarFunction`. `isovalue` should be used for isovalue computation
const triangulateField = prepareDispatch(root, (x, y, z) => {
  'kernel';
  const cell = GridCell(
    {
      vertex: [
        d.vec3f(x, y, z),
        d.vec3f(x + 1, y, z),
        d.vec3f(x + 1, y, z + 1),
        d.vec3f(x, y, z + 1),
        d.vec3f(x, y + 1, z),
        d.vec3f(x + 1, y + 1, z),
        d.vec3f(x + 1, y + 1, z + 1),
        d.vec3f(x, y + 1, z + 1),
      ],
      value: [
        loadValue(x, y, z),
        loadValue(x + 1, y, z),
        loadValue(x + 1, y, z + 1),
        loadValue(x, y, z + 1),
        loadValue(x, y + 1, z),
        loadValue(x + 1, y + 1, z),
        loadValue(x + 1, y + 1, z + 1),
        loadValue(x, y + 1, z + 1),
      ],
    },
  );
  const triangles = triangulateCell(cell, 0);

  for (let i = 0; i < triangles.count; i++) {
    const triangleIndex = std.atomicAdd(indexMutable.$, 1);
    trianglesMutable.$[triangleIndex] = triangles.triangles[i];
  }
});

const loadValue = tgpu.fn([d.u32, d.u32, d.u32], d.f32)((x, y, z) => {
  'kernel';
  const textureValue = std.textureLoad(
    generateBindGroupLayout.$.terrain,
    d.vec3u(x, y, z),
  );
  return textureValue.x;
});

triangulateField
  .with(generateBindGroupLayout, generateBindGroup)
  .dispatch(SIZE - 1, SIZE - 1, SIZE - 1);

// --- RENDER ---

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// model

const triangleCount = await indexMutable.read();
const triangles = await trianglesMutable.read();
const vertexedTriangles = triangles.map((
  triangle,
) => (triangle.points.map((vertex) => ({
  modelPosition: d.vec3f(vertex.x, vertex.y, vertex.z),
  modelNormal: triangle.normal,
})))).flat();
const vertexBuffer = root.createBuffer(
  d.arrayOf(
    d.struct({ modelPosition: d.vec3f, modelNormal: d.vec3f }),
    vertexedTriangles.length,
  ),
  vertexedTriangles,
).$usage('vertex');

const fishModel = {
  vertexBuffer,
  polygonCount: triangleCount,
};

// // https://sketchfab.com/3d-models/animated-low-poly-fish-64adc2e5a4be471e8279532b9610c878
// const fishModel = await loadModel(root, '/TypeGPU/assets/3d-fish/fish.obj');

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
  .withPrimitive({ cullMode: 'back' })
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
    .draw(fishModel.polygonCount * 3);

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
  orbitRadius = std.clamp(
    orbitRadius + event.deltaY * zoomSensitivity,
    3,
    1000,
  );
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

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import * as std from 'typegpu/std';

// == BORING ROOT STUFF ==
const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// == DATA STRUCTURES ==
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

// == SCENE ==
const aspect = canvas.clientWidth / canvas.clientHeight;
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(12, 7, 12, 1);

const cameraInitial: d.Infer<typeof Camera> = {
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()),
};

// == GEOMETRY ==
const heightScale = 4;
const getColor = (height: number): d.Infer<typeof Vertex>['color'] => {
  return d.vec4f(d.vec3f(1 - height / heightScale), 1);
};

const createPlane = (n: number, m: number): d.Infer<typeof Vertex>[] => {
  const nSideLength = 2;
  const mSideLength = 2;
  const nSubdivisionLength = nSideLength / (n - 1);
  const mSubdivisionLength = mSideLength / (m - 1);

  const indices = Array.from(
    { length: n },
    (_, i) => Array.from({ length: m }, (_, j) => [i, j] as [number, number]),
  );
  const coords = indices.map((ar) =>
    ar.map((e) => {
      const [i, j] = e;
      return [-1 + j * mSubdivisionLength, 1 - i * nSubdivisionLength];
    })
  );
  const heights = Array.from(
    { length: n * m },
    () => heightScale * Math.random(),
  );
  const vertices = coords.flat().map((e, i) => ({
    position: d.vec4f(e[0], heights[i], e[1], 1),
    color: getColor(heights[i]),
  }));

  return vertices;
};

const getPlaneIndexArray = (
  n: number,
  m: number,
): number[] => {
  const indices: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const topLeft = i * m + j;
      const topRight = i * m + (j + 1);
      const bottomLeft = (i + 1) * m + j;
      const bottomRight = (i + 1) * m + (j + 1);

      indices.push(topLeft, bottomLeft, bottomRight);
      indices.push(topLeft, bottomRight, topRight);
    }
  }

  return indices;
};

const getPlaneTransform = (
  translation: d.v3f,
  scale: d.v3f,
): d.Infer<typeof Transform> => {
  return {
    model: m.mat4.scale(
      m.mat4.translate(m.mat4.identity(d.mat4x4f()), translation, d.mat4x4f()),
      scale,
      d.mat4x4f(),
    ),
  };
};

// == TEMP CONST ==
// these 2 below must be greater than 1 each
const futureNumOfReleases = 49;
const futureNumOfSamples = 49;

// == BUFFERS ==
const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

const planeBuffer = root
  .createBuffer(
    vertexLayout.schemaForCount(futureNumOfReleases * futureNumOfSamples),
    createPlane(futureNumOfReleases, futureNumOfSamples),
  )
  .$usage('vertex');

const planeIndexBuffer = root
  .createBuffer(
    d.arrayOf(d.u16, (futureNumOfReleases - 1) * (futureNumOfSamples - 1) * 6),
    getPlaneIndexArray(futureNumOfReleases, futureNumOfSamples),
  )
  .$usage('index');

console.log(
  createPlane(futureNumOfReleases, futureNumOfSamples).map((vertex) =>
    vertex.position.join(',')
  ),
);
console.log(getPlaneIndexArray(futureNumOfSamples, futureNumOfReleases));

const planeTransformBuffer = root
  .createBuffer(
    Transform,
    getPlaneTransform(d.vec3f(0, -2, 0), d.vec3f(5, 1, 5)),
  )
  .$usage('uniform');

const layout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  transform: { uniform: Transform },
});

const planeBindGroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: planeTransformBuffer,
});

// == TEXTURES ==
let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let msaaTexture: GPUTexture;
let msaaTextureView: GPUTextureView;

// definitely not pure function
const createDepthAndMsaaTextures = () => {
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
};
createDepthAndMsaaTextures();

// == SHADERS ==
const vertex = tgpu['~unstable'].vertexFn({
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

const fragment = tgpu['~unstable'].fragmentFn({
  in: { color: d.vec4f },
  out: d.vec4f,
})((input) => input.color);

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

// == RENDER LOOP ==
const drawPlane = () => {
  pipeline
    .withColorAttachment({
      view: msaaTextureView,
      resolveTarget: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTextureView,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(vertexLayout, planeBuffer)
    .with(layout, planeBindGroup)
    .withIndexBuffer(planeIndexBuffer)
    .drawIndexed((futureNumOfReleases - 1) * (futureNumOfSamples - 1) * 6);
};

const render = drawPlane;

const frame = () => {
  requestAnimationFrame(frame);
  render();
};

frame();

// #region Example controls and cleanup

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

const updateCameraOrbit = (dx: number, dy: number) => {
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
};

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
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
}, { passive: false });

canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0) {
    // Left Mouse Button controls Camera Orbit.
    isDragging = true;
  }
  prevX = event.clientX;
  prevY = event.clientY;
});

const mouseUpEventListener = () => {
  isDragging = false;
};
window.addEventListener('mouseup', mouseUpEventListener);

canvas.addEventListener('mousemove', (event) => {
  const dx = event.clientX - prevX;
  const dy = event.clientY - prevY;
  prevX = event.clientX;
  prevY = event.clientY;

  if (isDragging) {
    updateCameraOrbit(dx, dy);
  }
});

const resizeObserver = new ResizeObserver(() => {
  createDepthAndMsaaTextures();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  window.removeEventListener('mouseup', mouseUpEventListener);
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion

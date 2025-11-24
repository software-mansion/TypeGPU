import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { Camera } from './camera.ts';
import { BoxGeometry } from './box-geometry.ts';
import { PointLight } from './point-light.ts';
import { CameraData, VertexData } from './types.ts';
import { fullScreenTriangle } from 'typegpu/common';

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
});

const vertexLayout = tgpu.vertexLayout(d.arrayOf(VertexData));

const mainCamera = new Camera(root);
mainCamera.position = d.vec3f(10, 10, 10);
mainCamera.target = d.vec3f(0, 0, 0);

const cube = new BoxGeometry(root);
cube.scale = d.vec3f(3, 1, 0.2);

const floorCube = new BoxGeometry(root);
floorCube.scale = d.vec3f(10, 0.1, 10);
floorCube.position = d.vec3f(0, -0.5, 0);

const pointLight = new PointLight(root, d.vec3f(2, 4, 1), {
  far: 100.0,
  shadowMapSize: 4096,
});

const modelMatrixUniform = root.createBuffer(d.mat4x4f).$usage('uniform');

let depthTexture = root['~unstable']
  .createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
  })
  .$usage('render');

// Bind group layouts
const renderLayout = tgpu.bindGroupLayout({
  camera: { uniform: CameraData },
  modelMatrix: { uniform: d.mat4x4f },
  lightPosition: { uniform: d.vec3f },
});

const renderLayoutWithShadow = tgpu.bindGroupLayout({
  camera: { uniform: CameraData },
  modelMatrix: { uniform: d.mat4x4f },
  shadowDepthCube: { texture: d.textureDepthCube() },
  shadowSampler: { sampler: 'comparison' },
  lightPosition: { uniform: d.vec3f },
});

// Debug pipeline setup
const debugSampler = root['~unstable'].createSampler({
  minFilter: 'nearest',
  magFilter: 'nearest',
});

const debugView = pointLight.createDebugArrayView();

const debugFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const tiled = d.vec2f(
    std.fract(uv.x * 3),
    1.0 - std.fract(uv.y * 2),
  );

  const col = std.floor(uv.x * 3);
  const row = std.floor(uv.y * 2);
  const arrayIndex = d.i32(row * 3 + col);

  const depth = std.textureSample(
    debugView.$,
    debugSampler.$,
    tiled,
    arrayIndex,
  );
  return d.vec4f(d.vec3f(depth ** 0.5), 1.0);
});

const debugPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(debugFragment, { format: presentationFormat })
  .createPipeline();

// Shadow depth pass shaders
const vertexDepth = tgpu['~unstable'].vertexFn({
  in: {
    ...VertexData.propTypes,
  },
  out: {
    pos: d.builtin.position,
    worldPos: d.vec3f,
  },
})(({ position }) => {
  const worldPos = renderLayout.$.modelMatrix.mul(d.vec4f(position, 1)).xyz;
  const pos = renderLayout.$.camera.viewProjectionMatrix.mul(
    d.vec4f(worldPos, 1),
  );

  return {
    pos,
    worldPos,
  };
});

const fragmentDepth = tgpu['~unstable'].fragmentFn({
  in: {
    worldPos: d.vec3f,
  },
  out: d.builtin.fragDepth,
})(({ worldPos }) => {
  const lightPos = renderLayout.$.lightPosition;

  const lightToFrag = worldPos.sub(lightPos);
  const dist = std.length(lightToFrag);

  // map [0, lightFar] -> [0, 1]
  const depth = dist / pointLight.far;

  return depth;
});

// Main render pass shaders
const vertexMain = tgpu['~unstable'].vertexFn({
  in: {
    ...VertexData.propTypes,
  },
  out: {
    pos: d.builtin.position,
    worldPos: d.vec3f,
    uv: d.vec2f,
    normal: d.vec3f,
  },
})(({ position, uv, normal }) => {
  const worldPos =
    renderLayoutWithShadow.$.modelMatrix.mul(d.vec4f(position, 1)).xyz;
  const pos = renderLayoutWithShadow.$.camera.viewProjectionMatrix.mul(
    d.vec4f(worldPos, 1),
  );

  return {
    pos,
    worldPos,
    uv,
    normal,
  };
});

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: {
    worldPos: d.vec3f,
    uv: d.vec2f,
    normal: d.vec3f,
  },
  out: d.vec4f,
})(({ worldPos, normal }) => {
  const lightPos = renderLayoutWithShadow.$.lightPosition;

  const lightToFrag = worldPos.sub(lightPos);
  const dist = std.length(lightToFrag);
  let dir = std.normalize(lightToFrag);
  dir = d.vec3f(dir.x, -dir.y, dir.z);

  const depthRef = dist / pointLight.far;

  const bias = 0.001 * (1.0 - std.dot(normal, std.normalize(lightToFrag)));
  const visibility = std.textureSampleCompare(
    renderLayoutWithShadow.$.shadowDepthCube,
    renderLayoutWithShadow.$.shadowSampler,
    dir,
    depthRef - bias,
  );

  const lightDir = std.normalize(lightPos.sub(worldPos));
  const diffuse = std.max(std.dot(normal, lightDir), 0.0);

  const baseColor = d.vec3f(1.0, 0.5, 0.31);
  const ambient = 0.1;
  const color = baseColor.mul(diffuse * visibility + ambient);

  return d.vec4f(color, 1.0);
});

// Samplers and views
const shadowSampler = root['~unstable'].createComparisonSampler({
  compare: 'less',
  magFilter: 'linear',
  minFilter: 'linear',
});

const shadowCubeView = pointLight.createCubeView();

// Main render bind group
const mainBindGroup = root.createBindGroup(renderLayoutWithShadow, {
  camera: mainCamera.uniform.buffer,
  modelMatrix: modelMatrixUniform,
  shadowDepthCube: shadowCubeView,
  shadowSampler: shadowSampler,
  lightPosition: pointLight.positionUniform.buffer,
});

// Pipelines
const pipelineMain = root['~unstable']
  .withVertex(vertexMain, vertexLayout.attrib)
  .withFragment(fragmentMain, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .createPipeline();

const pipelineDepthOne = root['~unstable']
  .withVertex(vertexDepth, vertexLayout.attrib)
  .withFragment(fragmentDepth, {})
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .createPipeline();

let renderDepthMap = false;

function render() {
  pointLight.renderShadowMaps(
    pipelineDepthOne,
    renderLayout,
    modelMatrixUniform,
    vertexLayout,
    [cube, floorCube],
  );

  if (renderDepthMap) {
    debugPipeline
      .withColorAttachment({
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
      })
      .draw(3);
    requestAnimationFrame(render);
    return;
  }

  // Render cube
  modelMatrixUniform.write(cube.modelMatrix);
  pipelineMain
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(mainBindGroup)
    .withIndexBuffer(cube.indexBuffer)
    .with(vertexLayout, cube.vertexBuffer)
    .drawIndexed(cube.indexCount);

  // Render floor
  modelMatrixUniform.write(floorCube.modelMatrix);
  pipelineMain
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'load',
      depthStoreOp: 'store',
    })
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'load',
      storeOp: 'store',
    })
    .with(mainBindGroup)
    .withIndexBuffer(floorCube.indexBuffer)
    .with(vertexLayout, floorCube.vertexBuffer)
    .drawIndexed(floorCube.indexCount);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const width = entry.contentBoxSize[0].inlineSize;
    const height = entry.contentBoxSize[0].blockSize;

    canvas.width = Math.max(
      1,
      Math.min(width, device.limits.maxTextureDimension2D),
    );
    canvas.height = Math.max(
      1,
      Math.min(height, device.limits.maxTextureDimension2D),
    );

    // Recreate depth texture with new size
    depthTexture = root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
      })
      .$usage('render');
  }
});

resizeObserver.observe(canvas);

// Orbit controls
let theta = Math.atan2(10, 10);
let phi = Math.acos(10 / Math.sqrt(10 * 10 + 10 * 10 + 10 * 10));
let radius = Math.sqrt(10 * 10 + 10 * 10 + 10 * 10);

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function updateCameraPosition() {
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  mainCamera.position = d.vec3f(x, y, z);
}

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;

  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  theta -= deltaX * 0.01;
  phi -= deltaY * 0.01;

  // Clamp phi to avoid gimbal lock
  phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

  updateCameraPosition();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();

  radius += e.deltaY * 0.01;
  radius = Math.max(1, Math.min(50, radius));

  updateCameraPosition();
});

export const controls = {
  'Light X': {
    initial: 2,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange: (v: number) => {
      pointLight.position = d.vec3f(
        v,
        pointLight.position.y,
        pointLight.position.z,
      );
    },
  },
  'Light Y': {
    initial: 4,
    min: 0.5,
    max: 10,
    step: 0.1,
    onSliderChange: (v: number) => {
      pointLight.position = d.vec3f(
        pointLight.position.x,
        v,
        pointLight.position.z,
      );
    },
  },
  'Light Z': {
    initial: 1,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange: (v: number) => {
      pointLight.position = d.vec3f(
        pointLight.position.x,
        pointLight.position.y,
        v,
      );
    },
  },
  'Depth map view': {
    initial: false,
    onToggleChange: (v: boolean) => {
      renderDepthMap = v;
    },
  },
};

import tgpu from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { BoxGeometry } from './box-geometry.ts';
import { Camera } from './camera.ts';
import { PointLight } from './point-light.ts';
import {
  CameraData,
  InstanceData,
  instanceLayout,
  VertexData,
  vertexLayout,
} from './types.ts';

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
});

const mainCamera = new Camera(root);
mainCamera.position = d.vec3f(5, 5, -5);
mainCamera.target = d.vec3f(0, 0, 0);

const pointLight = new PointLight(root, d.vec3f(2, 4, 1), {
  far: 100.0,
  shadowMapSize: 2048,
});

const cube = new BoxGeometry(root);
cube.scale = d.vec3f(3, 1, 0.2);

const floorCube = new BoxGeometry(root);
floorCube.scale = d.vec3f(10, 0.1, 10);
floorCube.position = d.vec3f(0, -0.5, 0);

let depthTexture = root['~unstable']
  .createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    sampleCount: 4,
  })
  .$usage('render');

let msaaTexture = root['~unstable']
  .createTexture({
    size: [canvas.width, canvas.height],
    format: presentationFormat,
    sampleCount: 4,
  })
  .$usage('render');

const shadowSampler = root['~unstable'].createComparisonSampler({
  compare: 'less',
  magFilter: 'linear',
  minFilter: 'linear',
});

const shadowCubeView = pointLight.createCubeView();

const renderLayout = tgpu.bindGroupLayout({
  camera: { uniform: CameraData },
  lightPosition: { uniform: d.vec3f },
});

const renderLayoutWithShadow = tgpu.bindGroupLayout({
  camera: { uniform: CameraData },
  shadowDepthCube: { texture: d.textureDepthCube() },
  shadowSampler: { sampler: 'comparison' },
  lightPosition: { uniform: d.vec3f },
});

const vertexDepth = tgpu['~unstable'].vertexFn({
  in: { ...VertexData.propTypes, ...InstanceData.propTypes },
  out: {
    pos: d.builtin.position,
    worldPos: d.vec3f,
  },
})(({ position, column1, column2, column3, column4 }) => {
  const modelMatrix = d.mat4x4f(column1, column2, column3, column4);
  const worldPos = modelMatrix.mul(d.vec4f(position, 1)).xyz;
  const pos = renderLayout.$.camera.viewProjectionMatrix.mul(
    d.vec4f(worldPos, 1),
  );

  return { pos, worldPos };
});

const fragmentDepth = tgpu['~unstable'].fragmentFn({
  in: { worldPos: d.vec3f },
  out: d.builtin.fragDepth,
})(({ worldPos }) => {
  const lightPos = renderLayout.$.lightPosition;
  const lightToFrag = worldPos.sub(lightPos);
  const dist = std.length(lightToFrag);

  return dist / pointLight.far;
});

const vertexMain = tgpu['~unstable'].vertexFn({
  in: { ...VertexData.propTypes, ...InstanceData.propTypes },
  out: {
    pos: d.builtin.position,
    worldPos: d.vec3f,
    uv: d.vec2f,
    normal: d.vec3f,
  },
})(({ position, uv, normal, column1, column2, column3, column4 }) => {
  const modelMatrix = d.mat4x4f(column1, column2, column3, column4);
  const worldPos = modelMatrix.mul(d.vec4f(position, 1)).xyz;
  const pos = renderLayoutWithShadow.$.camera.viewProjectionMatrix.mul(
    d.vec4f(worldPos, 1),
  );

  return { pos, worldPos, uv, normal };
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
  const dir = std.normalize(lightToFrag);

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

const previewSampler = root['~unstable'].createSampler({
  minFilter: 'nearest',
  magFilter: 'nearest',
});

const previewView = pointLight.createDepthArrayView();

const previewFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const tiled = d.vec2f(
    std.fract(uv.x * 3),
    std.fract(uv.y * 2),
  );

  const col = std.floor(uv.x * 3);
  const row = std.floor(uv.y * 2);
  const arrayIndex = d.i32(row * 3 + col);

  const depth = std.textureSample(
    previewView.$,
    previewSampler.$,
    tiled,
    arrayIndex,
  );
  return d.vec4f(d.vec3f(depth ** 0.5), 1.0);
});

const pipelineDepthOne = root['~unstable']
  .withVertex(vertexDepth, { ...vertexLayout.attrib, ...instanceLayout.attrib })
  .withFragment(fragmentDepth, {})
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .createPipeline();

const pipelineMain = root['~unstable']
  .withVertex(vertexMain, { ...vertexLayout.attrib, ...instanceLayout.attrib })
  .withFragment(fragmentMain, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withMultisample({ count: 4 })
  .createPipeline();

const pipelinePreview = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(previewFragment, { format: presentationFormat })
  .createPipeline();

const mainBindGroup = root.createBindGroup(renderLayoutWithShadow, {
  camera: mainCamera.uniform.buffer,
  shadowDepthCube: shadowCubeView,
  shadowSampler: shadowSampler,
  lightPosition: pointLight.positionUniform.buffer,
});

const instanceBuffer = root.createBuffer(d.arrayOf(InstanceData, 2), [
  cube.instanceData,
  floorCube.instanceData,
]).$usage('vertex');

let showDepthPreview = false;

function render() {
  pointLight.renderShadowMaps(
    pipelineDepthOne,
    renderLayout,
    cube.vertexBuffer,
    instanceBuffer,
    cube.indexBuffer,
    cube.indexCount,
    2,
  );

  if (showDepthPreview) {
    pipelinePreview
      .withColorAttachment({
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
      })
      .draw(3);
    requestAnimationFrame(render);
    return;
  }

  // Render cubes
  pipelineMain
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .withColorAttachment({
      resolveTarget: context.getCurrentTexture().createView(),
      view: root.unwrap(msaaTexture).createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(mainBindGroup)
    .withIndexBuffer(cube.indexBuffer)
    .with(vertexLayout, cube.vertexBuffer)
    .with(instanceLayout, instanceBuffer)
    .drawIndexed(cube.indexCount, 2);

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

    depthTexture = root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        sampleCount: 4,
      })
      .$usage('render');
    msaaTexture = root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height],
        format: presentationFormat,
        sampleCount: 4,
      })
      .$usage('render');
  }
});

resizeObserver.observe(canvas);

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
  'Show Depth Preview': {
    initial: false,
    onToggleChange: (v: boolean) => {
      showDepthPreview = v;
    },
  },
};

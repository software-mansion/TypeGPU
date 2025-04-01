import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import { cubeVertices } from './cubemap';
import { loadCubemap } from './cubemap';
import {
  Camera,
  CubeVertex,
  DirectionalLight,
  Material,
  Vertex,
} from './dataTypes';
import { IcosphereGenerator } from './icosphere';

// Initialization
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('WebGPU not supported');
}

const maxBufferSize = adapter.limits.maxStorageBufferBindingSize;
const maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
const maxSize = Math.min(maxBufferSize, maxStorageBufferBindingSize);
const device = await adapter.requestDevice({
  requiredLimits: {
    maxStorageBufferBindingSize: maxSize,
    maxBufferSize: maxSize,
  },
});
const root = tgpu.initFromDevice({ device });

// Canvas Setup

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// Geometry & Material Setup

let smoothNormals = false;
let subdivisions = 2;
const materialProps = {
  shininess: 32,
  reflectivity: 0.7,
  ambient: d.vec3f(0.1, 0.1, 0.1),
  diffuse: d.vec3f(0.3, 0.3, 0.3),
  specular: d.vec3f(0.8, 0.8, 0.8),
};

const icosphereGenerator = new IcosphereGenerator(root, maxSize);
let vertexBuffer = icosphereGenerator.createIcosphere(
  subdivisions,
  smoothNormals,
);
const cubeVertexBuffer = root
  .createBuffer(d.arrayOf(CubeVertex, cubeVertices.length), cubeVertices)
  .$usage('vertex');

// Camera Setup

const cameraInitialPos = d.vec3f(0, 1, 5);
const cameraBuffer = root
  .createBuffer(Camera, {
    view: m.mat4.lookAt(cameraInitialPos, [0, 0, 0], [0, 1, 0], d.mat4x4f()),
    projection: m.mat4.perspective(
      Math.PI / 4,
      canvas.width / canvas.height,
      0.1,
      10000,
      d.mat4x4f(),
    ),
    position: d.vec4f(cameraInitialPos, 1),
  })
  .$usage('uniform');

// Light & Material Buffers

const lightBuffer = root
  .createBuffer(DirectionalLight, {
    direction: d.vec3f(1, 1, 5),
    color: d.vec3f(1, 1, 1),
    intensity: 1,
  })
  .$usage('uniform');

const materialBuffer = root
  .createBuffer(Material, {
    ambient: materialProps.ambient,
    diffuse: materialProps.diffuse,
    specular: materialProps.specular,
    shininess: materialProps.shininess,
    reflectivity: materialProps.reflectivity,
  })
  .$usage('uniform');

// Textures & Samplers

const cubemapTexture = await loadCubemap(root);
const cubemap = cubemapTexture.createView('sampled', { dimension: 'cube' });
const sampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Bind Groups & Layouts

const renderLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  light: { uniform: DirectionalLight },
  material: { uniform: Material },
});
const { camera, light, material } = renderLayout.bound;

const renderBindGroup = root.createBindGroup(renderLayout, {
  camera: cameraBuffer,
  light: lightBuffer,
  material: materialBuffer,
});

const vertexLayout = tgpu.vertexLayout((n: number) => d.disarrayOf(Vertex, n));
const cubeVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(CubeVertex, n),
);

// Shader Functions

const vertexFn = tgpu['~unstable'].vertexFn({
  in: {
    position: d.vec4f,
    normal: d.vec4f,
  },
  out: {
    pos: d.builtin.position,
    normal: d.vec4f,
    worldPos: d.vec4f,
  },
})((input) => {
  const worldPos = input.position;
  const pos = std.mul(camera.value.view, input.position);
  return {
    pos: std.mul(camera.value.projection, pos),
    normal: input.normal,
    worldPos: worldPos,
  };
});

const fragmentFn = tgpu['~unstable'].fragmentFn({
  in: {
    normal: d.vec4f,
    worldPos: d.vec4f,
  },
  out: d.vec4f,
})((input) => {
  const norm = std.normalize(input.normal.xyz);
  const lDir = std.normalize(light.value.direction);

  const ambient = std.mul(
    material.value.ambient,
    std.mul(light.value.intensity, light.value.color),
  );
  const diffFactor = std.max(std.dot(norm, lDir), 0.0);
  const diffuse = std.mul(
    diffFactor,
    std.mul(
      material.value.diffuse,
      std.mul(light.value.intensity, light.value.color),
    ),
  );

  const vDir = std.normalize(
    std.sub(camera.value.position.xyz, input.worldPos.xyz),
  );

  const rDir = std.reflect(d.vec3f(-lDir.x, -lDir.y, -lDir.z), norm);
  const specFactor = std.pow(
    std.max(std.dot(vDir, rDir), 0.0),
    material.value.shininess,
  );
  const specular = std.mul(
    specFactor,
    std.mul(
      material.value.specular,
      std.mul(light.value.intensity, light.value.color),
    ),
  );

  const reflView = std.reflect(d.vec3f(-vDir.x, -vDir.y, -vDir.z), norm);
  const envColor = std.textureSample(cubemap, sampler, reflView);

  const directLighting = std.add(ambient, std.add(diffuse, specular));
  const finalColor = std.mix(
    directLighting,
    envColor.xyz,
    material.value.reflectivity,
  );
  return d.vec4f(finalColor, 1.0);
});

const cubeVertexFn = tgpu['~unstable'].vertexFn({
  in: {
    position: d.vec4f,
    uv: d.vec2f,
  },
  out: {
    pos: d.builtin.position,
    texCoord: d.vec3f,
  },
})((input) => {
  const viewRotationMatrix = d.mat4x4f(
    camera.value.view.columns[0],
    camera.value.view.columns[1],
    camera.value.view.columns[2],
    d.vec4f(0, 0, 0, 1),
  );
  const pos = std.mul(viewRotationMatrix, input.position);
  return {
    pos: std.mul(camera.value.projection, pos),
    texCoord: input.position.xyz,
  };
});

const cubeFragmentFn = tgpu['~unstable'].fragmentFn({
  in: {
    texCoord: d.vec3f,
  },
  out: d.vec4f,
})((input) => {
  const dir = std.normalize(input.texCoord);
  return std.textureSample(cubemap, sampler, dir);
});

// Pipeline Setup

const cubePipeline = root['~unstable']
  .withVertex(cubeVertexFn, cubeVertexLayout.attrib)
  .withFragment(cubeFragmentFn, { format: presentationFormat })
  .withPrimitive({
    cullMode: 'front',
  })
  .createPipeline();

const pipeline = root['~unstable']
  .withVertex(vertexFn, vertexLayout.attrib)
  .withFragment(fragmentFn, { format: presentationFormat })
  .withPrimitive({
    cullMode: 'back',
  })
  .createPipeline();

// Render Functions

function render() {
  cubePipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(cubeVertexLayout, cubeVertexBuffer)
    .with(renderLayout, renderBindGroup)
    .draw(cubeVertices.length);

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: 'load',
      storeOp: 'store',
    })
    .with(vertexLayout, vertexBuffer)
    .with(renderLayout, renderBindGroup)
    .draw(vertexBuffer.dataType.elementCount);

  root['~unstable'].flush();
}

function loop() {
  render();
  requestAnimationFrame(loop);
}

loop();

// #region Example controls and cleanup

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
let orbitRadius = std.length(cameraInitialPos);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(cameraInitialPos.x, cameraInitialPos.z);
let orbitPitch = Math.asin(cameraInitialPos.y / orbitRadius);

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
  orbitRadius = Math.max(1, orbitRadius + event.deltaY * zoomSensitivity);
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

export const controls = {
  subdivisions: {
    initial: 2,
    min: 0,
    max: 10,
    step: 1,
    onSliderChange(value: number) {
      subdivisions = value;
      vertexBuffer = icosphereGenerator.createIcosphere(
        subdivisions,
        smoothNormals,
      );
    },
  },
  'smooth normals': {
    initial: false,
    onToggleChange: (value: boolean) => {
      smoothNormals = value;
      vertexBuffer = icosphereGenerator.createIcosphere(
        subdivisions,
        smoothNormals,
      );
    },
  },
  'ambient color': {
    initial: materialProps.ambient,
    min: d.vec3f(0, 0, 0),
    max: d.vec3f(1, 1, 1),
    step: d.vec3f(0.01, 0.01, 0.01),
    onVectorSliderChange: (value: d.v3f) => {
      materialProps.ambient = value;
      materialBuffer.writePartial({ ambient: value });
    },
  },
  'diffuse color': {
    initial: materialProps.diffuse,
    min: d.vec3f(0, 0, 0),
    max: d.vec3f(1, 1, 1),
    step: d.vec3f(0.01, 0.01, 0.01),
    onVectorSliderChange: (value: d.v3f) => {
      materialProps.diffuse = value;
      materialBuffer.writePartial({ diffuse: value });
    },
  },
  'specular color': {
    initial: materialProps.specular,
    min: d.vec3f(0, 0, 0),
    max: d.vec3f(1, 1, 1),
    step: d.vec3f(0.01, 0.01, 0.01),
    onVectorSliderChange: (value: d.v3f) => {
      materialProps.specular = value;
      materialBuffer.writePartial({ specular: value });
    },
  },
  shininess: {
    initial: materialProps.shininess,
    min: 1,
    max: 128,
    step: 1,
    onSliderChange: (value: number) => {
      materialProps.shininess = value;
      materialBuffer.writePartial({ shininess: value });
    },
  },
  reflectivity: {
    initial: materialProps.reflectivity,
    min: 0,
    max: 1,
    step: 0.1,
    onSliderChange: (value: number) => {
      materialProps.reflectivity = value;
      materialBuffer.writePartial({ reflectivity: value });
    },
  },
};

export function onCleanup() {
  icosphereGenerator.destroy();
  cubemapTexture.destroy();
  root.destroy();

  resizeObserver.unobserve(canvas);
}

// #endregion

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import { type CubemapNames, cubeVertices, loadCubemap } from './cubemap.ts';
import {
  Camera,
  CubeVertex,
  DirectionalLight,
  Material,
  Vertex,
} from './dataTypes.ts';
import { IcosphereGenerator } from './icosphere.ts';

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
let exampleDestroyed = false;

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
  .createBuffer(Material, materialProps)
  .$usage('uniform');

// Textures & Samplers

let chosenCubemap: CubemapNames = 'campsite';
let cubemapTexture = await loadCubemap(root, chosenCubemap);
let cubemap = cubemapTexture.createView('sampled', { dimension: 'cube' });
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

const textureLayout = tgpu.bindGroupLayout({
  cubemap: { texture: 'float', viewDimension: 'cube' },
  texSampler: { sampler: 'filtering' },
});
const { cubemap: cubemapBinding, texSampler } = textureLayout.bound;

let textureBindGroup = root.createBindGroup(textureLayout, {
  cubemap,
  texSampler: sampler,
});

const vertexLayout = tgpu.vertexLayout((n: number) => d.disarrayOf(Vertex, n));
const cubeVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(CubeVertex, n)
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
})((input) => ({
  pos: std.mul(
    camera.value.projection,
    std.mul(camera.value.view, input.position),
  ),
  normal: input.normal,
  worldPos: input.position,
}));

const fragmentFn = tgpu['~unstable'].fragmentFn({
  in: {
    normal: d.vec4f,
    worldPos: d.vec4f,
  },
  out: d.vec4f,
})((input) => {
  const normalizedNormal = std.normalize(input.normal.xyz);
  const normalizedLightDir = std.normalize(light.value.direction);

  const ambientLight = std.mul(
    material.value.ambient,
    std.mul(light.value.intensity, light.value.color),
  );

  const diffuseFactor = std.max(
    std.dot(normalizedNormal, normalizedLightDir),
    0.0,
  );
  const diffuseLight = std.mul(
    diffuseFactor,
    std.mul(
      material.value.diffuse,
      std.mul(light.value.intensity, light.value.color),
    ),
  );

  const viewDirection = std.normalize(
    std.sub(camera.value.position.xyz, input.worldPos.xyz),
  );
  const reflectionDirection = std.reflect(
    std.neg(normalizedLightDir),
    normalizedNormal,
  );

  const specularFactor = std.pow(
    std.max(std.dot(viewDirection, reflectionDirection), 0.0),
    material.value.shininess,
  );
  const specularLight = std.mul(
    specularFactor,
    std.mul(
      material.value.specular,
      std.mul(light.value.intensity, light.value.color),
    ),
  );

  const reflectionVector = std.reflect(
    std.neg(viewDirection),
    normalizedNormal,
  );
  const environmentColor = std.textureSample(
    cubemapBinding,
    texSampler,
    reflectionVector,
  );

  const directLighting = std.add(
    ambientLight,
    std.add(diffuseLight, specularLight),
  );

  const finalColor = std.mix(
    directLighting,
    environmentColor.xyz,
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
  return {
    pos: std.mul(
      camera.value.projection,
      std.mul(viewRotationMatrix, input.position),
    ),
    texCoord: input.position.xyz,
  };
});

const cubeFragmentFn = tgpu['~unstable'].fragmentFn({
  in: {
    texCoord: d.vec3f,
  },
  out: d.vec4f,
})((input) => {
  return std.textureSample(
    cubemapBinding,
    texSampler,
    std.normalize(input.texCoord),
  );
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
    .with(textureLayout, textureBindGroup)
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
    .with(textureLayout, textureBindGroup)
    .draw(vertexBuffer.dataType.elementCount);

  root['~unstable'].flush();
}

function loop() {
  if (exampleDestroyed) {
    return;
  }
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
});

canvas.addEventListener('mousedown', (event) => {
  isDragging = true;
  prevX = event.clientX;
  prevY = event.clientY;
});

canvas.addEventListener('touchstart', (event) => {
  if (event.touches.length === 1) {
    isDragging = true;
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;
  }
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

window.addEventListener('touchend', () => {
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

canvas.addEventListener('touchmove', (event) => {
  if (isDragging && event.touches.length === 1) {
    event.preventDefault();
    const dx = event.touches[0].clientX - prevX;
    const dy = event.touches[0].clientY - prevY;
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;

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
  'cubemap texture': {
    initial: chosenCubemap,
    options: ['campsite', 'beach', 'chapel', 'city'],
    onSelectChange: async (value: CubemapNames) => {
      chosenCubemap = value;
      const newCubemapTexture = await loadCubemap(root, chosenCubemap);
      cubemap = newCubemapTexture.createView('sampled', { dimension: 'cube' });

      textureBindGroup = root.createBindGroup(textureLayout, {
        cubemap,
        texSampler: sampler,
      });

      cubemapTexture.destroy();
      cubemapTexture = newCubemapTexture;
    },
  },
  'ambient color': {
    initial: [
      materialProps.ambient.x,
      materialProps.ambient.y,
      materialProps.ambient.z,
    ] as const,
    onColorChange: (value: readonly [number, number, number]) => {
      materialProps.ambient = d.vec3f(value[0], value[1], value[2]);
      materialBuffer.writePartial({ ambient: materialProps.ambient });
    },
  },
  'diffuse color': {
    initial: [
      materialProps.diffuse.x,
      materialProps.diffuse.y,
      materialProps.diffuse.z,
    ] as const,
    onColorChange: (value: readonly [number, number, number]) => {
      materialProps.diffuse = d.vec3f(value[0], value[1], value[2]);
      materialBuffer.writePartial({ diffuse: materialProps.diffuse });
    },
  },
  'specular color': {
    initial: [
      materialProps.specular.x,
      materialProps.specular.y,
      materialProps.specular.z,
    ] as const,
    onColorChange: (value: readonly [number, number, number]) => {
      materialProps.specular = d.vec3f(value[0], value[1], value[2]);
      materialBuffer.writePartial({ specular: materialProps.specular });
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
  exampleDestroyed = true;
  resizeObserver.unobserve(canvas);
  icosphereGenerator.destroy();
  cubemapTexture.destroy();
  root.destroy();
}

// #endregion

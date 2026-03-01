import tgpu, { d, std } from 'typegpu';
import * as m from 'wgpu-matrix';
import { type CubemapNames, cubeVertices, loadCubemap } from './cubemap.ts';
import { Camera, CubeVertex, DirectionalLight, Material, Vertex } from './dataTypes.ts';
import { IcosphereGenerator } from './icosphere.ts';
import { defineControls } from '../../common/defineControls.ts';

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
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
let exampleDestroyed = false;

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
let vertexBuffer = icosphereGenerator.createIcosphere(subdivisions, smoothNormals);
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

const materialBuffer = root.createBuffer(Material, materialProps).$usage('uniform');

// Textures & Samplers

let chosenCubemap: CubemapNames = 'campsite';
const size = 2048;
const texture = root['~unstable']
  .createTexture({
    dimension: '2d',
    size: [size, size, 6],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
await loadCubemap(texture, chosenCubemap);

const cubemap = texture.createView(d.textureCube(d.f32));
const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Bind Groups & Layouts

const renderLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  light: { uniform: DirectionalLight },
  material: { uniform: Material },
});

const renderBindGroup = root.createBindGroup(renderLayout, {
  camera: cameraBuffer,
  light: lightBuffer,
  material: materialBuffer,
});

const textureLayout = tgpu.bindGroupLayout({
  cubemap: { texture: d.textureCube(d.f32) },
  texSampler: { sampler: 'filtering' },
});

const textureBindGroup = root.createBindGroup(textureLayout, {
  cubemap,
  texSampler: sampler,
});

const vertexLayout = tgpu.vertexLayout(d.disarrayOf(Vertex));
const cubeVertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(CubeVertex, n));

// Shader Functions

const vertexFn = tgpu.vertexFn({
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
    renderLayout.$.camera.projection,
    std.mul(renderLayout.$.camera.view, input.position),
  ),
  normal: input.normal,
  worldPos: input.position,
}));

const fragmentFn = tgpu.fragmentFn({
  in: {
    normal: d.vec4f,
    worldPos: d.vec4f,
  },
  out: d.vec4f,
})((input) => {
  const normalizedNormal = std.normalize(input.normal.xyz);
  const normalizedLightDir = std.normalize(renderLayout.$.light.direction);

  const ambientLight = renderLayout.$.material.ambient
    .mul(renderLayout.$.light.color)
    .mul(renderLayout.$.light.intensity);

  const diffuseFactor = std.max(std.dot(normalizedNormal, normalizedLightDir), 0);
  const diffuseLight = renderLayout.$.material.diffuse
    .mul(renderLayout.$.light.color)
    .mul(renderLayout.$.light.intensity)
    .mul(diffuseFactor);

  const viewDirection = std.normalize(renderLayout.$.camera.position.xyz.sub(input.worldPos.xyz));
  const reflectionDirection = std.reflect(std.neg(normalizedLightDir), normalizedNormal);

  const specularFactor =
    std.max(std.dot(viewDirection, reflectionDirection), 0) ** renderLayout.$.material.shininess;
  const specularLight = renderLayout.$.material.specular
    .mul(renderLayout.$.light.color)
    .mul(renderLayout.$.light.intensity)
    .mul(specularFactor);

  const reflectionVector = std.reflect(std.neg(viewDirection), normalizedNormal);
  const environmentColor = std.textureSample(
    textureLayout.$.cubemap,
    textureLayout.$.texSampler,
    reflectionVector,
  );

  const directLighting = ambientLight.add(diffuseLight.add(specularLight));

  const finalColor = std.mix(
    directLighting,
    environmentColor.rgb,
    renderLayout.$.material.reflectivity,
  );

  return d.vec4f(finalColor, 1.0);
});

const cubeVertexFn = tgpu.vertexFn({
  in: {
    position: d.vec3f,
    uv: d.vec2f,
  },
  out: {
    pos: d.builtin.position,
    texCoord: d.vec3f,
  },
})((input) => {
  const viewPos = renderLayout.$.camera.view.mul(d.vec4f(input.position.xyz, 0)).xyz;

  return {
    pos: renderLayout.$.camera.projection.mul(d.vec4f(viewPos, 1)),
    texCoord: input.position.xyz,
  };
});

const cubeFragmentFn = tgpu.fragmentFn({
  in: { texCoord: d.vec3f },
  out: d.vec4f,
})((input) => {
  return std.textureSample(
    textureLayout.$.cubemap,
    textureLayout.$.texSampler,
    std.normalize(input.texCoord),
  );
});

// Pipeline Setup

const cubePipeline = root.createRenderPipeline({
  attribs: cubeVertexLayout.attrib,
  vertex: cubeVertexFn,
  fragment: cubeFragmentFn,
  primitive: { cullMode: 'front' },
});

const pipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex: vertexFn,
  fragment: fragmentFn,
  primitive: { cullMode: 'back' },
});

// Render Functions

function render() {
  cubePipeline
    .withColorAttachment({
      view: context,
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
    })
    .with(cubeVertexLayout, cubeVertexBuffer)
    .with(renderBindGroup)
    .with(textureBindGroup)
    .draw(cubeVertices.length);

  pipeline
    .withColorAttachment({
      view: context,
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: 'load',
    })
    .with(vertexLayout, vertexBuffer)
    .with(renderBindGroup)
    .with(textureBindGroup)
    .draw(vertexBuffer.dataType.elementCount);
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
let lastPinchDist = 0;
let orbitRadius = std.length(cameraInitialPos);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(cameraInitialPos.x, cameraInitialPos.z);
let orbitPitch = Math.asin(cameraInitialPos.y / orbitRadius);

function updateCameraPosition() {
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);

  const newView = m.mat4.lookAt(newCameraPos, d.vec3f(0, 0, 0), d.vec3f(0, 1, 0), d.mat4x4f());
  cameraBuffer.writePartial({ view: newView, position: newCameraPos });
}

function updateCameraOrbit(dx: number, dy: number) {
  orbitYaw += -dx * 0.005;
  orbitPitch = std.clamp(orbitPitch + dy * 0.005, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  updateCameraPosition();
}

function zoomCamera(delta: number) {
  orbitRadius = std.clamp(orbitRadius + delta, 3, 100);
  updateCameraPosition();
}

canvas.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault();
    zoomCamera(e.deltaY * 0.05);
  },
  { passive: false },
);

canvas.addEventListener('mousedown', (event) => {
  isDragging = true;
  prevX = event.clientX;
  prevY = event.clientY;
});

canvas.addEventListener(
  'touchstart',
  (e) => {
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
  },
  { passive: false },
);

const mouseUpEventListener = () => {
  isDragging = false;
};
window.addEventListener('mouseup', mouseUpEventListener);

const touchEndEventListener = (e: TouchEvent) => {
  if (e.touches.length === 1) {
    isDragging = true;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
  } else {
    isDragging = false;
  }
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

canvas.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const pinchDist = Math.sqrt(dx * dx + dy * dy);
      zoomCamera((lastPinchDist - pinchDist) * 0.05);
      lastPinchDist = pinchDist;
    }
  },
  { passive: false },
);

function hideHelp() {
  const helpElem = document.getElementById('help');
  if (helpElem) {
    helpElem.style.opacity = '0';
  }
}
for (const eventName of ['click', 'keydown', 'wheel', 'touchstart']) {
  canvas.addEventListener(eventName, hideHelp, { once: true, passive: true });
}

export const controls = defineControls({
  subdivisions: {
    initial: 2,
    min: 0,
    max: 10,
    step: 1,
    onSliderChange(value) {
      subdivisions = value;
      vertexBuffer = icosphereGenerator.createIcosphere(subdivisions, smoothNormals);
    },
  },
  'smooth normals': {
    initial: false,
    onToggleChange: (value) => {
      smoothNormals = value;
      vertexBuffer = icosphereGenerator.createIcosphere(subdivisions, smoothNormals);
    },
  },
  'cubemap texture': {
    initial: chosenCubemap,
    options: ['campsite', 'beach', 'chapel', 'city'],
    onSelectChange: async (value) => {
      chosenCubemap = value;
      await loadCubemap(texture, chosenCubemap);
    },
  },
  'ambient color': {
    initial: materialProps.ambient,
    onColorChange: (value) => {
      materialProps.ambient = value;
      materialBuffer.writePartial({ ambient: materialProps.ambient });
    },
  },
  'diffuse color': {
    initial: materialProps.diffuse,
    onColorChange: (value) => {
      materialProps.diffuse = value;
      materialBuffer.writePartial({ diffuse: materialProps.diffuse });
    },
  },
  'specular color': {
    initial: materialProps.specular,
    onColorChange: (value) => {
      materialProps.specular = value;
      materialBuffer.writePartial({ specular: materialProps.specular });
    },
  },
  shininess: {
    initial: materialProps.shininess,
    min: 1,
    max: 128,
    step: 1,
    onSliderChange: (value) => {
      materialProps.shininess = value;
      materialBuffer.writePartial({ shininess: value });
    },
  },
  reflectivity: {
    initial: materialProps.reflectivity,
    min: 0,
    max: 1,
    step: 0.1,
    onSliderChange: (value) => {
      materialProps.reflectivity = value;
      materialBuffer.writePartial({ reflectivity: value });
    },
  },
});

export function onCleanup() {
  exampleDestroyed = true;
  window.removeEventListener('mouseup', mouseUpEventListener);
  window.removeEventListener('mousemove', mouseMoveEventListener);
  window.removeEventListener('touchmove', touchMoveEventListener);
  window.removeEventListener('touchend', touchEndEventListener);
  resizeObserver.unobserve(canvas);
  icosphereGenerator.destroy();
  root.destroy();
}

// #endregion

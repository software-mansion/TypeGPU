import tgpu, {
  type Render,
  type Sampled,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuBuffer,
  type TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import { computeShader } from './compute.ts';
import { loadModel } from './load-model.ts';
import * as p from './params.ts';
import { type Preset, presets, presetsEnum } from './presets.ts';
import {
  mainFragment,
  mainVertex,
  skyBoxFragment,
  skyBoxVertex,
} from './render.ts';
import {
  Camera,
  CelestialBody,
  SkyBoxVertex,
  celestialBodiesBindGroupLayout,
  renderBindGroupLayout,
  renderInstanceLayout,
  renderBindGroupLayout as renderLayout,
  skyBoxVertexLayout,
  textureBindGroupLayout,
} from './schemas.ts';
import {
  loadSkyBox,
  loadSphereTextures,
  skyBoxVertices,
  sphereTextureNamesEnum,
} from './textures.ts';

// AAA presety: atom, ziemia i księzyc, oort cloud / planet ring, solar system,
// andromeda x milky way, particles, balls on ground, negative mass
// AAA speed slider
// AAA bufor z czasem
// AAA zderzenia
// AAA mobile touch support
// AAA fix specular artifact
// AAA fix weird gravity behavior
// AAA (inny ticket) show left menu, show code editor zapisane w linku

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const root = await tgpu.init();
const device = root.device;
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// static resources

const { vertexBuffer: sphereVertexBuffer, vertexCount: sphereVertexCount } =
  await loadModel(root, '/TypeGPU/assets/gravity/sphere.obj');

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const cameraInitial = Camera({
  position: p.cameraInitialPos.xyz,
  view: m.mat4.lookAt(
    p.cameraInitialPos,
    p.cameraTarget,
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
});
const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

const skyBoxVertexBuffer = root
  .createBuffer(d.arrayOf(SkyBoxVertex, skyBoxVertices.length), skyBoxVertices)
  .$usage('vertex');

const sphereTextures = await loadSphereTextures(root);

const renderBindGroup = root.createBindGroup(renderBindGroupLayout, {
  camera: cameraBuffer,
  sampler,
  celestialBodyTextures: sphereTextures,
});

const celestialBodiesCountBuffer = root.createBuffer(d.i32).$usage('uniform');

// dynamic resources

interface DynamicResources {
  celestialBodiesCount: number;
  flip: number;
  celestialBodiesBufferA: TgpuBuffer<d.WgslArray<typeof CelestialBody>> &
    StorageFlag;
  celestialBodiesBufferB: TgpuBuffer<d.WgslArray<typeof CelestialBody>> &
    StorageFlag;
  celestialBodiesBindGroupA: TgpuBindGroup<
    (typeof celestialBodiesBindGroupLayout)['entries']
  >;
  celestialBodiesBindGroupB: TgpuBindGroup<
    (typeof celestialBodiesBindGroupLayout)['entries']
  >;
  skyBoxTexture: TgpuTexture<{ size: [2048, 2048, 6]; format: 'rgba8unorm' }> &
    Render &
    Sampled;
  skyBoxBindGroup: TgpuBindGroup<(typeof textureBindGroupLayout)['entries']>;
}

const dynamicResourcesBox = {
  data: await loadPreset('Atom'),
};

// Pipelines
const computePipeline = root['~unstable']
  .withCompute(computeShader)
  .createPipeline()
  .$name('compute pipeline');

const skyBoxPipeline = root['~unstable']
  .withVertex(skyBoxVertex, skyBoxVertexLayout.attrib)
  .withFragment(skyBoxFragment, { format: presentationFormat })
  .withPrimitive({
    cullMode: 'front',
  })
  .createPipeline();

const renderPipeline = root['~unstable']
  .withVertex(mainVertex, renderInstanceLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withPrimitive({ topology: 'triangle-list', cullMode: 'front' })
  .createPipeline();

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

function render() {
  dynamicResourcesBox.data.flip = 1 - dynamicResourcesBox.data.flip;

  computePipeline
    .with(
      celestialBodiesBindGroupLayout,
      dynamicResourcesBox.data.flip === 1
        ? dynamicResourcesBox.data.celestialBodiesBindGroupA
        : dynamicResourcesBox.data.celestialBodiesBindGroupB,
    )
    .dispatchWorkgroups(dynamicResourcesBox.data.celestialBodiesCount);

  skyBoxPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(skyBoxVertexLayout, skyBoxVertexBuffer)
    .with(renderLayout, renderBindGroup)
    .with(textureBindGroupLayout, dynamicResourcesBox.data.skyBoxBindGroup)
    .draw(skyBoxVertices.length);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'load',
      storeOp: 'store',
      clearValue: [0, 1, 0, 1], // background color
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(renderInstanceLayout, sphereVertexBuffer)
    .with(renderBindGroupLayout, renderBindGroup)
    .with(
      celestialBodiesBindGroupLayout,
      dynamicResourcesBox.data.flip === 1
        ? dynamicResourcesBox.data.celestialBodiesBindGroupA
        : dynamicResourcesBox.data.celestialBodiesBindGroupB,
    )
    .draw(sphereVertexCount, dynamicResourcesBox.data.celestialBodiesCount);

  root['~unstable'].flush();
}

let destroyed = false;
// Frame loop
function frame() {
  if (destroyed) {
    return;
  }
  render();
  requestAnimationFrame(frame);
}
frame();

async function loadPreset(preset: Preset): Promise<DynamicResources> {
  const presetData = presets[preset];

  const celestialBodies: d.Infer<typeof CelestialBody>[] =
    presetData.celestialBodies.flatMap((group) =>
      group.elements.map((element) => {
        const radius = element.radius ?? element.mass ** (1 / 3);
        return {
          modelTransformationMatrix: std.mul(radius, std.identity()),
          position: element.position,
          velocity: element.velocity ?? d.vec3f(),
          mass: element.mass,
          radius: radius,
          textureIndex: sphereTextureNamesEnum.indexOf(group.texture),
        };
      }),
    );

  const computeBufferA = root
    .createBuffer(
      d.arrayOf(CelestialBody, celestialBodies.length),
      celestialBodies,
    )
    .$usage('storage');
  const computeBufferB = root
    .createBuffer(d.arrayOf(CelestialBody, celestialBodies.length))
    .$usage('storage');

  const celestialBodiesBindGroupA = root.createBindGroup(
    celestialBodiesBindGroupLayout,
    {
      celestialBodiesCount: celestialBodiesCountBuffer,
      inState: computeBufferA,
      outState: computeBufferB,
    },
  );

  const celestialBodiesBindGroupB = root.createBindGroup(
    celestialBodiesBindGroupLayout,
    {
      celestialBodiesCount: celestialBodiesCountBuffer,
      inState: computeBufferB,
      outState: computeBufferA,
    },
  );

  celestialBodiesCountBuffer.write(celestialBodies.length);

  const skyBoxTexture = await loadSkyBox(root, presetData.skyBox);
  const skyBox = skyBoxTexture.createView('sampled', { dimension: 'cube' });

  const textureBindGroup = root.createBindGroup(textureBindGroupLayout, {
    skyBox: skyBox,
    sampler: sampler,
  });

  return {
    flip: 0,
    celestialBodiesCount: celestialBodies.length,
    celestialBodiesBufferA: computeBufferA,
    celestialBodiesBufferB: computeBufferB,
    celestialBodiesBindGroupA,
    celestialBodiesBindGroupB,
    skyBoxTexture,
    skyBoxBindGroup: textureBindGroup,
  };
}

// #region Camera controls

export const controls = {
  Preset: {
    initial: presetsEnum[0],
    options: presetsEnum,
    async onSelectChange(value: Preset) {
      const oldData = dynamicResourcesBox.data;
      // AAA dispose of the oldData
      dynamicResourcesBox.data = await loadPreset(value);
    },
  },
};

const resizeObserver = new ResizeObserver(() => {
  const proj = m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    d.mat4x4f(),
  );

  cameraBuffer.writePartial({ projection: proj });
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
let orbitRadius = std.length(p.cameraInitialPos);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(p.cameraInitialPos.x, p.cameraInitialPos.z);
let orbitPitch = Math.asin(p.cameraInitialPos.y / orbitRadius);

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
  cameraBuffer.writePartial({ view: newView, position: newCameraPos.xyz });
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
  cameraBuffer.writePartial({ view: newView, position: newCameraPos.xyz });
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

export function onCleanup() {
  destroyed = true;
  resizeObserver.unobserve(canvas);
  root.destroy();
}

// #endregion

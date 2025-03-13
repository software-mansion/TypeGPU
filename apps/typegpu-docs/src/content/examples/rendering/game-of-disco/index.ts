import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import { Camera, DirectionalLight, Material, Vertex } from './dataTypes';
import { createIcosphere } from './icosphere';

const root = await tgpu.init();

const cubemapUrls = [
  'cubemapTest/posx.jpg', // right
  'cubemapTest/negx.jpg', // left
  'cubemapTest/posy.jpg', // top
  'cubemapTest/negy.jpg', // bottom
  'cubemapTest/posz.jpg', // front
  'cubemapTest/negz.jpg', // back
];

async function loadCubemap(device: GPUDevice, urls: string[]) {
  const size = 512;

  const texture = root['~unstable']
    .createTexture({
      dimension: '2d',
      size: [size, size, 6],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render', 'storage');

  // Load each face concurrently
  await Promise.all(
    urls.map(async (url, i) => {
      const response = await fetch(url);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: root.unwrap(texture), mipLevel: 0, origin: [0, 0, i] },
        [size, size],
      );
    }),
  );

  return texture;
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const subdivisions = 6;
const vertices = createIcosphere(subdivisions);

const vertexBuffer = root
  .createBuffer(d.arrayOf(Vertex, vertices.length), vertices)
  .$usage('vertex');

const cameraPosition = d.vec4f(0, 0, 5, 1); // Camera position for specular lighting
const cameraInitialPos = d.vec3f(0, 1, 5);
const cameraBuffer = root
  .createBuffer(Camera, {
    view: m.mat4.lookAt(cameraInitialPos, [0, 0, 0], [0, 1, 0], d.mat4x4f()),
    projection: m.mat4.perspective(
      Math.PI / 4,
      canvas.width / canvas.height,
      0.1,
      100,
      d.mat4x4f(),
    ),
    position: cameraPosition,
  })
  .$usage('uniform');

const lightBuffer = root
  .createBuffer(DirectionalLight, {
    direction: d.vec3f(1, 1, 5),
    color: d.vec3f(1, 1, 1),
    intensity: 1,
  })
  .$usage('uniform');

const materialBuffer = root
  .createBuffer(Material, {
    ambient: d.vec3f(0.2, 0.2, 0.2),
    diffuse: d.vec3f(0.7, 0.7, 0.7),
    specular: d.vec3f(0.1, 0.1, 0.1),
    shininess: 21,
    reflectivity: 0.1,
  })
  .$usage('uniform');

const cubemapTexture = await loadCubemap(root.device, cubemapUrls);
const cubemapSampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
  addressModeW: 'clamp-to-edge',
});

const renderLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  light: { uniform: DirectionalLight },
  material: { uniform: Material },
  cubemap: { texture: 'float', viewDimension: 'cube' },
  sampler: { sampler: 'filtering' },
});
const { camera, light, material, cubemap, sampler } = renderLayout.bound;

const renderBindGroup = root.createBindGroup(renderLayout, {
  camera: cameraBuffer,
  light: lightBuffer,
  material: materialBuffer,
  cubemap: cubemapTexture,
  sampler: cubemapSampler,
});

const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(Vertex, n));

const vertexFn = tgpu['~unstable']
  .vertexFn({
    in: {
      position: d.vec4f,
      color: d.vec4f,
      normal: d.vec4f,
    },
    out: {
      pos: d.builtin.position,
      color: d.vec4f,
      normal: d.vec4f,
      worldPos: d.vec4f,
    },
  })
  .does((input) => {
    const worldPos = input.position;
    const pos = std.mul(camera.value.view, input.position);
    const normal = std.mul(camera.value.view, input.normal);
    return {
      pos: std.mul(camera.value.projection, pos),
      color: input.color,
      normal: normal,
      worldPos: worldPos,
    };
  });

const fragmentFn = tgpu['~unstable']
  .fragmentFn({
    in: {
      color: d.vec4f,
      normal: d.vec4f,
      worldPos: d.vec4f,
    },
    out: d.vec4f,
  })
  .does(`(input: vi) -> @location(0) vec4f {
    // Calculate normalized vectors for lighting
    let norm = normalize(input.normal.xyz);
    let lDir = normalize(light.direction);

    // Ambient component
    let ambient = material.ambient * light.color * light.intensity;

    // Diffuse component
    let diffFactor = max(dot(norm, lDir), 0.0);
    let diffuse = diffFactor * material.diffuse * light.color * light.intensity;

    // Specular component
    let vDir = normalize(camera.position.xyz - input.worldPos.xyz);
    let rDir = reflect(-lDir, norm);
    let specFactor = pow(max(dot(vDir, rDir), 0.0), material.shininess);
    let specular = specFactor * material.specular * light.color * light.intensity;

    // Environment reflection
    let reflView = reflect(-vDir, norm);
    let envColor = textureSample(cubemap, sampler, reflView);

    // Combine direct lighting with environmental reflection
    let directLighting = (ambient + diffuse + specular) * input.color.xyz;
    let finalColor = mix(directLighting, envColor.xyz, material.reflectivity);

    return vec4f(finalColor, 1.0);
  }`)
  .$uses({
    camera,
    light,
    material,
    cubemap,
    sampler,
  });

const pipeline = root['~unstable']
  .withVertex(vertexFn, vertexLayout.attrib)
  .withFragment(fragmentFn, { format: presentationFormat })
  .withPrimitive({
    cullMode: 'back',
  })
  .createPipeline();

function render() {
  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(vertexLayout, vertexBuffer)
    .with(renderLayout, renderBindGroup)
    .draw(vertices.length);

  root['~unstable'].flush();
}

function loop() {
  render();
  requestAnimationFrame(loop);
}

loop();

// #region Example controls and cleanup

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
  cameraBuffer.writePartial({ view: newView });
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

export function onCleanup() {
  cubemapTexture.destroy();
  root.destroy();
}

// #endregion

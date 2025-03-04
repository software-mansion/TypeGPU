import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

const scale = 5;

const Vertex = d.struct({
  position: d.location(0, d.vec3f),
  normal: d.location(1, d.vec3f),
  uv: d.location(2, d.vec2f),
});
const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(Vertex, n));

const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

const TriangleData = d.struct({
  pos: d.vec4f,
  vel: d.vec4f,
});

const bindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  triangleData: { uniform: TriangleData },
  texture: { texture: 'float' },
  sampler: { sampler: 'filtering' },
});
const {
  camera,
  texture: shaderTexture,
  sampler: shaderSampler,
  triangleData,
} = bindGroupLayout.bound;

// setup

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

const cubeModel = await load('assets/gravity/blahaj_smooth.obj', OBJLoader);
const textureResponse = await fetch('assets/gravity/texture.png');
const imageBitmap = await createImageBitmap(await textureResponse.blob());
const cubeTexture = root['~unstable']
  .createTexture({
    size: [imageBitmap.width, imageBitmap.height],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');

device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture: root.unwrap(cubeTexture) },
  [imageBitmap.width, imageBitmap.height],
);

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Camera
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(0, 0, 5, 1);
const cameraInitial = {
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    d.mat4x4f(),
  ),
};
const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');
const dataBuffer = root.createBuffer(TriangleData).$usage('uniform');

const bindGroup = root.createBindGroup(bindGroupLayout, {
  camera: cameraBuffer,
  texture: cubeTexture,
  triangleData: dataBuffer,
  sampler,
});

// Vertex
const vertexBuffer = root
  .createBuffer(
    vertexLayout.schemaForCount(cubeModel.attributes.POSITION.value.length / 3),
  )
  .$usage('vertex')
  .$name('vertex');

const positions = cubeModel.attributes.POSITION.value;
const normals = cubeModel.attributes.NORMAL
  ? cubeModel.attributes.NORMAL.value
  : new Float32Array(positions.length);
const uvs = cubeModel.attributes.TEXCOORD_0
  ? cubeModel.attributes.TEXCOORD_0.value
  : new Float32Array((positions.length / 3) * 2);

const vertices = [];
for (let i = 0; i < positions.length / 3; i++) {
  vertices.push({
    position: d.vec3f(
      positions[3 * i],
      positions[3 * i + 1],
      positions[3 * i + 2],
    ),
    normal: d.vec3f(normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]),
    uv: d.vec2f(uvs[2 * i], 1 - uvs[2 * i + 1]),
  });
}
vertices.reverse();

vertexBuffer.write(vertices);

// Shaders
const sampleTexture = tgpu['~unstable']
  .fn([d.vec2f], d.vec4f)
  .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(shaderTexture, shaderSampler, uv);
  }`)
  .$uses({ shaderTexture, shaderSampler })
  .$name('sampleShader');

const VertexOutput = {
  position: d.builtin.position,
  uv: d.vec2f,
  normals: d.vec3f,
  worldPosition: d.vec4f,
};

const mainVertex = tgpu['~unstable']
  .vertexFn({
    in: { position: d.vec4f, normal: d.vec3f, uv: d.vec2f },
    out: VertexOutput,
  })
  .does((input) => {
    const localPos = input.position;

    const vel = triangleData.value.vel;
    const normVel = std.normalize(vel);

    const yaw = std.atan2(normVel.z, normVel.x) + Math.PI;
    const yawCos = std.cos(yaw);
    const yawSin = std.sin(yaw);

    // biome-ignore format:
    const yawRotation = d.mat4x4f(
      yawCos,   0, yawSin,  0,
      0,        1, 0,       0,
      -yawSin,  0, yawCos,  0,
      0,        0, 0,       1,
    );

    const pitch = -std.asin(-normVel.y);
    const pitchCos = std.cos(pitch);
    const pitchSin = std.sin(pitch);

    // biome-ignore format:
    const pitchRotation = d.mat4x4f(
      pitchCos, -pitchSin, 0, 0,
      pitchSin, pitchCos,  0, 0,
      0,        0,         1, 0,
      0,        0,         0, 1,
    );

    const worldPos = std.add(
      std.mul(pitchRotation, std.mul(yawRotation, std.mul(scale, localPos))),
      triangleData.value.pos,
    );

    const uniformNormal = d.vec4f(
      input.normal.x,
      input.normal.y,
      input.normal.z,
      1,
    );
    const worldNormal = std.add(
      std.mul(pitchRotation, std.mul(yawRotation, uniformNormal)),
      triangleData.value.pos,
    );

    const pos = std.mul(
      camera.value.projection,
      std.mul(camera.value.view, worldPos),
    );

    return {
      position: pos,
      uv: input.uv,
      normals: worldNormal.xyz,
      worldPosition: worldPos,
    };
  })
  .$name('mainVertex');

const lightColor = d.vec3f(1, 0.8, 0.7);
const lightDirection = std.normalize(d.vec3f(-1.0, 0.0, 0.0));
const negLightDirection = std.mul(-1, lightDirection);

const mainFragment = tgpu['~unstable']
  .fragmentFn({
    in: VertexOutput,
    out: d.location(0, d.vec4f),
  })
  .does((input) => {
    const normal = std.normalize(input.normals);

    // Directional lighting
    const attenuation = std.max(std.dot(normal, negLightDirection), 0.0);
    const sunColor = std.mul(attenuation, lightColor);

    const surfaceToLight = negLightDirection;

    const albedoWithAlpha = sampleTexture(input.uv); // base color
    const albedo = albedoWithAlpha.xyz;
    const ambient = d.vec3f(0.4);

    const surfaceToCamera = std.normalize(
      std.sub(cameraInitialPos, input.worldPosition),
    );

    const halfVector = std.normalize(
      std.add(surfaceToLight, surfaceToCamera.xyz),
    );
    const specular = std.pow(std.max(std.dot(normal, halfVector), 0.0), 3);

    const finalColor = std.add(
      std.mul(albedo, std.add(ambient, sunColor)),
      std.mul(specular, lightColor),
    );
    return d.vec4f(finalColor.x, finalColor.y, finalColor.z, 1);
  })
  .$name('mainFragment');

// Render pipeline
const renderPipeline = root['~unstable']
  .withVertex(mainVertex, vertexLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withPrimitive({ topology: 'triangle-list' })
  .createPipeline();

const depthTexture = device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

let pos = d.vec4f(0, 0, 0, 1);

function render() {
  const vel = d.vec4f(
    -1 * 0.00002,
    Math.sin(Date.now() * 0.001) * 0.00002,
    0,
    0,
  );
  pos = std.add(pos, vel);
  dataBuffer.write({
    pos,
    vel,
  });

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'load',
      storeOp: 'store',
      clearValue: [1, 1, 1, 1],
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(vertexLayout, vertexBuffer)
    .with(bindGroupLayout, bindGroup)
    .draw(positions.length / 3);

  root['~unstable'].flush();
}

let destroyed = false;
function frame() {
  if (destroyed) {
    return;
  }

  requestAnimationFrame(frame);
  render();
}

// #region Camera controls

let isDragging = false;
let prevX = 0;
let prevY = 0;
let rotation = m.mat4.identity(d.mat4x4f());

canvas.addEventListener('mousedown', (event) => {
  isDragging = true;
  prevX = event.clientX;
  prevY = event.clientY;
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('mousemove', (event) => {
  if (!isDragging) {
    return;
  }

  const dx = event.clientX - prevX;
  const dy = event.clientY - prevY;
  prevX = event.clientX;
  prevY = event.clientY;
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
  rotation = m.mat4.mul(deltaRotation, rotation, d.mat4x4f());

  const rotatedCamPos = m.mat4.mul(rotation, cameraInitialPos, d.vec4f());
  const newView = m.mat4.lookAt(
    rotatedCamPos,
    target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );

  cameraBuffer.writePartial({
    view: newView,
  });
});

frame();

export function onCleanup() {
  destroyed = true;
  root.destroy();
}

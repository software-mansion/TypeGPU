import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { mul } from 'typegpu/std';
import * as m from 'wgpu-matrix';

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
const bindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  texture: { texture: 'float' },
  sampler: { sampler: 'filtering' },
});
const { camera, texture: shaderTexture, sampler: shaderSampler } = bindGroupLayout.bound;

// Shaders
const sampleTexture = tgpu['~unstable']
  .fn([d.vec2f], d.vec4f)
  .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(shaderTexture, shaderSampler, uv);
  }`)
  .$uses({ shaderTexture, shaderSampler })
  .$name('sampleShader');

const mainVertex = tgpu['~unstable']
  .vertexFn({
    in: { position: d.vec4f, normal: d.vec3f, uv: d.vec2f },
    out: { position: d.builtin.position, uv: d.location(1, d.vec2f) },
  })
  .does((input) => {
    const pos = mul(
      camera.value.projection,
      mul(camera.value.view, input.position),
    );

    return {
      position: pos,
      uv: input.uv,
    };
  })
  .$name('mainVertex');

const mainFragment = tgpu['~unstable']
  .fragmentFn({
    in: {uv: d.location(1, d.vec2f)},
    out: d.location(0, d.vec4f),
  })
  .does((input) => sampleTexture(input.uv))
  .$name('mainFragment');


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

const cubeModel = await load('assets/gravity/blahaj.obj', OBJLoader);
const textureResponse = await fetch('assets/gravity/texture.png');
const imageBitmap = await createImageBitmap(await textureResponse.blob());
const cubeTexture = root[`~unstable`]
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
console.log(cubeModel.attributes);

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Camera
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(5, 2, 5, 1);
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


const bindGroup = root.createBindGroup(bindGroupLayout, {
  camera: cameraBuffer,
  texture: cubeTexture,
  sampler,
});

// Vertex
const vertexBuffer = root
  .createBuffer(
    vertexLayout.schemaForCount(
      cubeModel.attributes['POSITION'].value.length / 3,
    ),
  )
  .$usage('vertex')
  .$name('vertex');

const positions = cubeModel.attributes['POSITION'].value;
const normals = cubeModel.attributes['NORMAL']
  ? cubeModel.attributes['NORMAL'].value
  : new Float32Array(positions.length);
const uvs = cubeModel.attributes['TEXCOORD_0']
  ? cubeModel.attributes['TEXCOORD_0'].value
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

// Render pipeline
const renderPipeline = root['~unstable']
  .withVertex(mainVertex, vertexLayout.attrib)
  .withFragment(mainFragment, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
  .createPipeline();

function render() {
  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'load',
      storeOp: 'store',
      clearValue: [1, 1, 1, 1],
    })
    .with(vertexLayout, vertexBuffer)
    .with(bindGroupLayout, bindGroup)
    .draw(positions.length/3);
  console.log(positions.length)

  root['~unstable'].flush();
}
console.log('Cube position:', await vertexBuffer.read());

let destoyed = false;
function frame() {
  if (destoyed) {
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
  destoyed = true;
  root.destroy();
}

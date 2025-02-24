import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

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

const Vertex = d.struct({
  position: d.vec4f,
  color: d.vec4f,
});

const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

function getColor(): d.Infer<typeof Vertex>['color'] {
  return d.vec4f(Math.random(), Math.random(), Math.random(), 1);
}

function createCube(): d.Infer<typeof Vertex>[] {
  // Front face
  const front: d.Infer<typeof Vertex>[] = [
    { position: d.vec4f(-1, -1, 1, 1), color: getColor() },
    { position: d.vec4f(1, -1, 1, 1), color: getColor() },
    { position: d.vec4f(1, 1, 1, 1), color: getColor() },
    { position: d.vec4f(-1, -1, 1, 1), color: getColor() },
    { position: d.vec4f(1, 1, 1, 1), color: getColor() },
    { position: d.vec4f(-1, 1, 1, 1), color: getColor() },
  ];
  // Back face
  const back: d.Infer<typeof Vertex>[] = [
    { position: d.vec4f(-1, -1, -1, 1), color: getColor() },
    { position: d.vec4f(-1, 1, -1, 1), color: getColor() },
    { position: d.vec4f(1, -1, -1, 1), color: getColor() },
    { position: d.vec4f(1, -1, -1, 1), color: getColor() },
    { position: d.vec4f(-1, 1, -1, 1), color: getColor() },
    { position: d.vec4f(1, 1, -1, 1), color: getColor() },
  ];
  // Top face
  const top: d.Infer<typeof Vertex>[] = [
    { position: d.vec4f(-1, 1, -1, 1), color: getColor() },
    { position: d.vec4f(-1, 1, 1, 1), color: getColor() },
    { position: d.vec4f(1, 1, -1, 1), color: getColor() },
    { position: d.vec4f(1, 1, -1, 1), color: getColor() },
    { position: d.vec4f(-1, 1, 1, 1), color: getColor() },
    { position: d.vec4f(1, 1, 1, 1), color: getColor() },
  ];
  // Bottom face
  const bottom: d.Infer<typeof Vertex>[] = [
    { position: d.vec4f(-1, -1, -1, 1), color: getColor() },
    { position: d.vec4f(1, -1, -1, 1), color: getColor() },
    { position: d.vec4f(-1, -1, 1, 1), color: getColor() },
    { position: d.vec4f(1, -1, -1, 1), color: getColor() },
    { position: d.vec4f(1, -1, 1, 1), color: getColor() },
    { position: d.vec4f(-1, -1, 1, 1), color: getColor() },
  ];
  // Right face
  const right: d.Infer<typeof Vertex>[] = [
    { position: d.vec4f(1, -1, -1, 1), color: getColor() },
    { position: d.vec4f(1, 1, -1, 1), color: getColor() },
    { position: d.vec4f(1, -1, 1, 1), color: getColor() },
    { position: d.vec4f(1, -1, 1, 1), color: getColor() },
    { position: d.vec4f(1, 1, -1, 1), color: getColor() },
    { position: d.vec4f(1, 1, 1, 1), color: getColor() },
  ];
  // Left face
  const left: d.Infer<typeof Vertex>[] = [
    { position: d.vec4f(-1, -1, -1, 1), color: getColor() },
    { position: d.vec4f(-1, -1, 1, 1), color: getColor() },
    { position: d.vec4f(-1, 1, -1, 1), color: getColor() },
    { position: d.vec4f(-1, -1, 1, 1), color: getColor() },
    { position: d.vec4f(-1, 1, 1, 1), color: getColor() },
    { position: d.vec4f(-1, 1, -1, 1), color: getColor() },
  ];

  return [...front, ...back, ...top, ...bottom, ...right, ...left];
}

const aspect = canvas.clientWidth / canvas.clientHeight;
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(5, 2, 5, 1);

const cameraInitial = {
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()),
};

const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(Vertex, n));

const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');
const cubeBuffer = root
  .createBuffer(vertexLayout.schemaForCount(36), createCube())
  .$usage('vertex');

const bindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
});
const { camera } = bindGroupLayout.bound;

const vertex = tgpu['~unstable']
  .vertexFn({
    in: { position: d.vec4f, color: d.vec4f },
    out: { pos: d.builtin.position, color: d.vec4f },
  })
  .does((input) => {
    const pos = std.mul(
      camera.value.projection,
      std.mul(camera.value.view, input.position),
    );
    return { pos: pos, color: input.color };
  });

const fragment = tgpu['~unstable']
  .fragmentFn({
    in: { color: d.vec4f },
    out: d.vec4f,
  })
  .does((input) => {
    return input.color;
  });

const bindGroup = root.createBindGroup(bindGroupLayout, {
  camera: cameraBuffer,
});

const pipeline = root['~unstable']
  .withVertex(vertex, vertexLayout.attrib)
  .withFragment(fragment, { format: presentationFormat })
  .withPrimitive({
    // culling is a replacement for z-buffer in this instance (which is not the intended use)
    cullMode: 'back',
  })
  .createPipeline()
  .with(vertexLayout, cubeBuffer)
  .with(bindGroupLayout, bindGroup);

function render() {
  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    })
    .draw(36);

  root['~unstable'].flush();
}

function frame() {
  requestAnimationFrame(frame);
  render();
}

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

canvas.addEventListener('mousemove', async (event) => {
  if (!isDragging) {
    return;
  }

  const dx = event.clientX - prevX;
  const dy = event.clientY - prevY;
  prevX = event.clientX;
  prevY = event.clientY;
  const sensitivity = 0.003;
  const yaw = dx * sensitivity;
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

  rotation = m.mat4.mul(yawMatrix, rotation, d.mat4x4f());
  rotation = m.mat4.mul(pitchMatrix, rotation, d.mat4x4f());

  const rotatedCamPos = m.mat4.mul(rotation, cameraInitialPos, d.vec4f());

  const newView = m.mat4.lookAt(
    rotatedCamPos,
    target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );

  const { projection } = await cameraBuffer.read();
  cameraBuffer.write({ view: newView, projection });
});

frame();

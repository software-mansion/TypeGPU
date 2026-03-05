import tgpu, { d, std } from 'typegpu';
import { Camera, setupFirstPersonCamera } from '../../common/setup-first-person-camera.ts';
import { BlockInstance, CubeVertex, InstanceLayout, VertexCubeLayout } from './schemas.ts';
import { cubeVertices } from './cubeVertices.ts';
import { chunkToInstanceData, generate } from './chunkGenerator.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const cubeVertexBuffer = root
  .createBuffer(d.disarrayOf(CubeVertex, 36), cubeVertices)
  .$usage('vertex');

const chunkData = generate(d.vec3i(0, 0, 0));
const instanceData = chunkToInstanceData(chunkData);
const instanceBuffer = root
  .createBuffer(d.disarrayOf(BlockInstance, instanceData.length), instanceData)
  .$usage('vertex');

const cameraUniform = root.createUniform(Camera);
const { cleanupCamera, updatePosition } = setupFirstPersonCamera(
  canvas,
  { initPos: d.vec3f(8, 6, -8), speed: d.vec3f(0.01, 0.1, 1) },
  (camera) => {
    cameraUniform.writePartial(camera);
  },
);

function createDepthTexture() {
  return root['~unstable']
    .createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus' })
    .$usage('render');
}
let depthTexture = createDepthTexture();

const resizeObserver = new ResizeObserver(() => {
  depthTexture = createDepthTexture();
});
resizeObserver.observe(canvas);

const pipeline = root.createRenderPipeline({
  attribs: { ...VertexCubeLayout.attrib, ...InstanceLayout.attrib },
  vertex: tgpu.vertexFn({
    in: { position: d.vec4f, uv: d.vec2f, blockPos: d.vec4i },
    out: { pos: d.builtin.position, worldPos: d.vec4f },
  })((input) => {
    'use gpu';
    const worldPos = d.vec4f(input.position.xyz + d.vec3f(input.blockPos.xyz), 1);
    return {
      pos: cameraUniform.$.projection * cameraUniform.$.view * worldPos,
      worldPos,
    };
  }),
  fragment: tgpu.fragmentFn({
    in: { worldPos: d.vec4f },
    out: d.vec4f,
  })(({ worldPos }) => {
    'use gpu';
    const localPos = std.fract(worldPos.xyz);
    const nearEdge = std.min(localPos, 1 - localPos);
    const highest = std.max(nearEdge.x, nearEdge.y, nearEdge.z);
    const secondHighest = nearEdge.x + nearEdge.y + nearEdge.z - highest;
    const distFromEdge = std.min(highest, secondHighest);
    const color = std.select(d.vec3f(0.5), d.vec3f(0.3), distFromEdge < 0.05);
    return d.vec4f(color, 1);
  }),
  targets: { format: presentationFormat },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  primitive: { cullMode: 'back' },
});

let frameId = requestAnimationFrame(draw);

function draw() {
  updatePosition();

  pipeline
    .withDepthStencilAttachment({
      view: depthTexture,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
      depthClearValue: 1,
    })
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0.5, 0.7, 0.9, 1],
    })
    .with(VertexCubeLayout, cubeVertexBuffer)
    .with(InstanceLayout, instanceBuffer)
    .draw(36, instanceData.length);

  frameId = requestAnimationFrame(draw);
}

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  resizeObserver.disconnect();
  root.destroy();
}

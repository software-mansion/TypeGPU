import * as m from 'wgpu-matrix';
import tgpu, { d, std } from 'typegpu';
import { CubeVertex, vertexCubeLayout } from './schemas.ts';
import { cubeVertices } from './cubeVertices.ts';
import {
  Camera,
  setupFirstPersonCamera,
} from '../../common/setup-first-person-camera.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const cameraUniform = root.createUniform(Camera);
const { cleanupCamera, updatePosition } = setupFirstPersonCamera(
  canvas,
  { initPos: d.vec3f(5), target: d.vec3f(0.5), speed: d.vec3f(0.01, 0.1, 1) },
  (camera) => {
    cameraUniform.writePartial(camera);
  },
);

const cubeVertexBuffer = root
  .createBuffer(d.disarrayOf(CubeVertex, 36), cubeVertices)
  .$usage('vertex');

const renderPipeline = root['~unstable'].createRenderPipeline({
  attribs: { ...vertexCubeLayout.attrib },
  vertex: tgpu['~unstable'].vertexFn({
    in: { position: d.vec4f, uv: d.vec2f },
    out: { pos: d.builtin.position, worldPos: d.vec4f },
  })((input) => {
    const position = input.position;
    const uv = cameraUniform.$.projection
      .mul(cameraUniform.$.view)
      .mul(position);

    return { pos: uv, worldPos: position };
  }),
  fragment: tgpu['~unstable'].fragmentFn({
    in: { worldPos: d.vec4f },
    out: d.vec4f,
  })(({ worldPos }) => {
    // one of the coordinates is zero, we ignore that one
    const localPos = std.fract(worldPos.xyz);
    const nearEdge = std.min(localPos, d.vec3f(1).sub(localPos));
    const highest = std.max(nearEdge.x, nearEdge.y, nearEdge.z);
    const secondHighest = nearEdge.x + nearEdge.y + nearEdge.z - highest;
    const distFromEdge = std.min(highest, secondHighest);
    const color = std.select(
      d.vec3f(0, 1, 0),
      d.vec3f(0, 0.8, 0),
      distFromEdge < 0.05,
    );

    return d.vec4f(color, 1);
  }),
  targets: { format: presentationFormat },
  primitive: { cullMode: 'back' },
});

let frameId = requestAnimationFrame(draw);
function draw() {
  updatePosition();
  renderPipeline
    .with(vertexCubeLayout, cubeVertexBuffer)
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(36);

  frameId = requestAnimationFrame(draw);
}

export function onCleanup() {
  root.destroy();
  cleanupCamera();
  cancelAnimationFrame(frameId);
}

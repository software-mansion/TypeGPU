import * as m from 'wgpu-matrix';
import tgpu, { d } from 'typegpu';
import { Camera, CubeVertex, vertexCubeLayout } from './schemas.ts';
import { cubeVertices } from './cubeVertices.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const viewPosition = d.vec3f(5, 5, 5);
const viewTarget = d.vec3f(0, 0, 0);
const aspectRatio = canvas.clientWidth / canvas.clientHeight;
const camera = Camera({
  view: m.mat4.lookAt(viewPosition, viewTarget, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(
    Math.PI / 4,
    aspectRatio,
    0.1,
    1000,
    d.mat4x4f(),
  ),
});
const cameraUniform = root.createUniform(Camera, camera);
const cubeVertexBuffer = root
  .createBuffer(d.disarrayOf(CubeVertex, 36), cubeVertices)
  .$usage('vertex');

const renderPipeline = root['~unstable'].createRenderPipeline({
  attribs: { ...vertexCubeLayout.attrib },
  vertex: tgpu['~unstable'].vertexFn({
    in: { position: d.vec4f, uv: d.vec2f },
    out: { pos: d.builtin.position },
  })((input) => {
    const position = input.position;
    const uv = cameraUniform.$.projection
      .mul(cameraUniform.$.view)
      .mul(position);

    return { pos: uv };
  }),
  fragment: tgpu['~unstable'].fragmentFn({ out: d.vec4f })(() => {
    return d.vec4f(0, 1, 0, 1);
  }),
  targets: { format: presentationFormat },
});

let frameId = requestAnimationFrame(draw);
function draw() {
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
  cancelAnimationFrame(frameId);
}

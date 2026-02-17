import * as m from 'wgpu-matrix';
import tgpu, { d } from 'typegpu';
import { Camera } from './schemas.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const viewPosition = d.vec3f(2, 2, 2);
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

const renderPipeline = root['~unstable'].createRenderPipeline({
  vertex: tgpu['~unstable'].vertexFn({
    in: { vId: d.builtin.vertexIndex },
    out: { pos: d.builtin.position },
  })(({ vId }) => {
    const positions = [
      d.vec4f(0, 0.5, 0, 1),
      d.vec4f(0.5, -0.5, 0, 1),
      d.vec4f(-0.5, -0.5, 0, 1),
    ];
    const uv = cameraUniform.$.projection
      .mul(cameraUniform.$.view)
      .mul(positions[vId]);

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
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  frameId = requestAnimationFrame(draw);
}

export function onCleanup() {
  root.destroy();
  cancelAnimationFrame(frameId);
}

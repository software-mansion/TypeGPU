import tgpu, { d } from 'typegpu';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const renderPipeline = root['~unstable'].createRenderPipeline({
  vertex: tgpu['~unstable'].vertexFn({
    in: { vId: d.builtin.vertexIndex },
    out: { pos: d.builtin.position },
  })(({ vId }) => {
    const uvs = [d.vec2f(0, 0.5), d.vec2f(0.5, -0.5), d.vec2f(-0.5, -0.5)];

    return { pos: d.vec4f(uvs[vId], 0, 1) };
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

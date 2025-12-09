import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const yellow = d.vec4f(0.8392156862745098, 0.6470588235294118, 0.11764705882352941, 1);

const root = await tgpu.init();

const PositionArray = d.arrayOf(d.vec2f); 

const Uniforms = d.struct({
  trianglePositions: PositionArray(3),
});


const pos = PositionArray(3)([
  d.vec2f(0.0, 0.5),
  d.vec2f(-0.5, -0.5),
  d.vec2f(0.5, -0.5)
]);

const uniforms = root.createReadonly(Uniforms,{trianglePositions: pos});


const mainFragment = tgpu['~unstable'].fragmentFn({
  out: d.vec4f,
})(() => {
  return yellow;
}) 

const mainVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex},
  out: { outPos: d.builtin.position},
})((input) => {
  const vertexPosition = uniforms.$.trianglePositions[input.vertexIndex];
  return {outPos: d.vec4f(vertexPosition, 0, 1)};
});

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});


const pipeline = root['~unstable']
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

let isRunning = true;

function draw(timestamp: number) {
  if (!isRunning) return;

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);


export function onCleanup() {
  isRunning = false;
  root.destroy();
}

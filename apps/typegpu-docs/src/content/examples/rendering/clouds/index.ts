import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { raymarchSlot, resolutionAccess, timeAccess } from './consts.ts';
import { mainVertex } from './shaders/vertex.ts';
import { mainFragment } from './shaders/fragment.ts';
import { raymarch } from './utils.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();
const device = root.device;

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// Uniforms
const time = root.createUniform(d.f32, 0);
const resolutionUniform = root.createUniform(
  d.vec2f,
  d.vec2f(canvas.width, canvas.height),
);

const pipeline = root['~unstable']
  .with(raymarchSlot, raymarch)
  .with(timeAccess, time)
  .with(resolutionAccess, resolutionUniform)
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

// Animation loop
let frameId: number;
function render() {
  resolutionUniform.write(d.vec2f(canvas.width, canvas.height));
  time.write((performance.now() / 1000) % 500);

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(6);

  frameId = requestAnimationFrame(render);
}

frameId = requestAnimationFrame(render);

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

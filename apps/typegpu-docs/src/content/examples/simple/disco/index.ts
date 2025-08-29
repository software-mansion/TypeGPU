import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { mainVertex } from './shaders/vertex.ts';
import { dimensionsSlot, timeAccess } from './consts.ts';
import { mainFragment, mainFragment2 } from './shaders/fragment.ts';

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
const w = root.createUniform(d.f32, canvas.width);
const h = root.createUniform(d.f32, canvas.height);

const pipeline = root['~unstable']
  .with(timeAccess, time)
  .with(dimensionsSlot, { w: canvas.width, h: canvas.height })
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

const pipeline2 = root['~unstable']
  .with(timeAccess, time)
  .with(dimensionsSlot, { w: canvas.width, h: canvas.height })
  .withVertex(mainVertex, {})
  .withFragment(mainFragment2, { format: presentationFormat })
  .createPipeline();
let currentPipeline = pipeline;

let startTime = performance.now();
let frameId: number;

function render() {
  const timestamp = (performance.now() - startTime) / 1000;
  if (timestamp > 500.0) startTime = performance.now();
  time.write(timestamp);
  w.write(canvas.width);
  h.write(canvas.height);

  currentPipeline
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

export const controls = {
  'Pattern': {
    initial: 'pattern1',
    options: ['pattern1', 'pattern2'].map((x) => x),
    onSelectChange(value: string) {
      currentPipeline = value === 'pattern1' ? pipeline : pipeline2;
      render();
    },
  },
};

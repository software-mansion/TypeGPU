import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { mainVertex } from './shaders/vertex.ts';
import { resolutionAccess, timeAccess } from './consts.ts';
import {
  mainFragment,
  mainFragment2,
  mainFragment3,
  mainFragment4,
  mainFragment5,
  mainFragment6,
  mainFragment7,
} from './shaders/fragment.ts';

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
  .with(timeAccess, time)
  .with(resolutionAccess, resolutionUniform)
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

const pipeline2 = root['~unstable']
  .with(timeAccess, time)
  .with(resolutionAccess, resolutionUniform)
  .withVertex(mainVertex, {})
  .withFragment(mainFragment2, { format: presentationFormat })
  .createPipeline();
const pipeline3 = root['~unstable']
  .with(timeAccess, time)
  .with(resolutionAccess, resolutionUniform)
  .withVertex(mainVertex, {})
  .withFragment(mainFragment3, { format: presentationFormat })
  .createPipeline();
const pipeline4 = root['~unstable']
  .with(timeAccess, time)
  .with(resolutionAccess, resolutionUniform)
  .withVertex(mainVertex, {})
  .withFragment(mainFragment4, { format: presentationFormat })
  .createPipeline();
const pipeline5 = root['~unstable']
  .with(timeAccess, time)
  .with(resolutionAccess, resolutionUniform)
  .withVertex(mainVertex, {})
  .withFragment(mainFragment5, { format: presentationFormat })
  .createPipeline();
const pipeline6 = root['~unstable']
  .with(timeAccess, time)
  .with(resolutionAccess, resolutionUniform)
  .withVertex(mainVertex, {})
  .withFragment(mainFragment6, { format: presentationFormat })
  .createPipeline();
const pipeline7 = root['~unstable']
  .with(timeAccess, time)
  .with(resolutionAccess, resolutionUniform)
  .withVertex(mainVertex, {})
  .withFragment(mainFragment7, { format: presentationFormat })
  .createPipeline();
let currentPipeline = pipeline;

let startTime = performance.now();
let frameId: number;

function render() {
  const timestamp = (performance.now() - startTime) / 1000;
  if (timestamp > 500.0) startTime = performance.now();
  time.write(timestamp);
  resolutionUniform.write(d.vec2f(canvas.width, canvas.height));

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
  Pattern: {
    initial: 'pattern1',
    options: [
      'pattern1',
      'pattern2',
      'pattern3',
      'pattern4',
      'pattern5',
      'pattern6',
      'pattern7',
    ],
    onSelectChange(value: string) {
      switch (value) {
        case 'pattern1':
          currentPipeline = pipeline;
          break;
        case 'pattern2':
          currentPipeline = pipeline2;
          break;
        case 'pattern3':
          currentPipeline = pipeline3;
          break;
        case 'pattern4':
          currentPipeline = pipeline4;
          break;
        case 'pattern5':
          currentPipeline = pipeline5;
          break;
        case 'pattern6':
          currentPipeline = pipeline6;
          break;
        case 'pattern7':
          currentPipeline = pipeline7;
          break;
      }
      render();
    },
  },
};

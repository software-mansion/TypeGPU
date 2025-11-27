import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { resolutionAccess, timeAccess } from './consts.ts';
import {
  mainFragment1,
  mainFragment2,
  mainFragment3,
  mainFragment4,
  mainFragment5,
  mainFragment6,
  mainFragment7,
} from './shaders/fragment.ts';
import { mainVertex } from './shaders/vertex.ts';

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

const fragmentShaders = [
  mainFragment1,
  mainFragment2,
  mainFragment3,
  mainFragment4,
  mainFragment5,
  mainFragment6,
  mainFragment7,
];

const pipelines = fragmentShaders.map((fragment) =>
  root['~unstable']
    .with(timeAccess, time)
    .with(resolutionAccess, resolutionUniform)
    .withVertex(mainVertex, {})
    .withFragment(fragment, { format: presentationFormat })
    .createPipeline()
);

let currentPipeline = pipelines[0];

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
      const patternIndex = {
        pattern1: 0,
        pattern2: 1,
        pattern3: 2,
        pattern4: 3,
        pattern5: 4,
        pattern6: 5,
        pattern7: 6,
      }[value];
      if (patternIndex !== undefined) {
        currentPipeline = pipelines[patternIndex];
      }
    },
  },
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick() {
      const namespace = tgpu['~unstable'].namespace();
      Array.from({ length: 6 }).map((_, i) =>
        root.device.createShaderModule({
          code: tgpu.resolve([pipelines[i + 1]], { names: namespace }),
        })
      );
    },
  },
};

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { fullScreenTriangle } from 'typegpu/common';
import {
  fullColorFragment,
  timeAccess,
  type Uniforms,
  uniformsAccess,
} from './shader.ts';

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

export const uniforms: d.Infer<typeof Uniforms> = {
  color: d.vec4f(1, 0, 0, 0),
  face_oval: d.vec4f(0),
  head_pitch: 0,
  head_yaw: 0,
  spike_height: 0.1,
  a: 0,
};

const time = root.createUniform(d.f32, 0);

const fullColorRenderPipeline = root['~unstable']
  .with(uniformsAccess, uniforms)
  .with(timeAccess, time)
  .withVertex(fullScreenTriangle)
  .withFragment(fullColorFragment, { format: presentationFormat })
  .createPipeline();

let isRunning = true;

function draw(timestamp: number) {
  if (!isRunning) {
    return;
  }

  time.write(timestamp * 0.001 % 1000);
  fullColorRenderPipeline
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: context.getCurrentTexture().createView(),
    })
    .draw(3);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

export const controls = {};

export function onCleanup() {
  isRunning = false;
  root.destroy();
}

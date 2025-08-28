import tgpu, { type TgpuSampledTexture } from 'typegpu';
import * as d from 'typegpu/data';
import {
  dimensionsSlot,
  raymarchSlot,
  sampledViewSlot,
  samplerSlot,
  timeAccess,
} from './consts.ts';
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
const w = root.createUniform(d.f32, canvas.width);
const h = root.createUniform(d.f32, canvas.height);

const NOISE_SIZE = 256;
const noiseData = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
for (let i = 0; i < noiseData.length; i += 4) {
  const r = Math.random() * 255;
  const g = Math.random() * 255;
  noiseData[i] = r;
  noiseData[i + 1] = g;
  noiseData[i + 2] = r;
  noiseData[i + 3] = 255;
}

const imageTexture = root['~unstable']
  .createTexture({ size: [NOISE_SIZE, NOISE_SIZE], format: 'rgba8unorm' })
  .$usage('sampled', 'render');

device.queue.writeTexture(
  { texture: root.unwrap(imageTexture) },
  noiseData,
  { bytesPerRow: NOISE_SIZE * 4 },
  { width: NOISE_SIZE, height: NOISE_SIZE },
);

const sampledView = imageTexture.createView('sampled') as TgpuSampledTexture<
  '2d',
  d.F32
>;
const sampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const pipeline = root['~unstable']
  .with(raymarchSlot, raymarch)
  .with(sampledViewSlot, sampledView)
  .with(samplerSlot, sampler)
  .with(timeAccess, time)
  .with(dimensionsSlot, { w: canvas.width, h: canvas.height })
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

// Animation loop
let frameId: number;
function render() {
  w.write(canvas.width);
  h.write(canvas.height);
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

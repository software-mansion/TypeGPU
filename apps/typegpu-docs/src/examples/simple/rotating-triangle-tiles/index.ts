import { colors } from './geometry.ts';
import {
  animationProgressUniform,
  getInstanceInfoBindGroup,
  gridParamsBuffer,
  shiftedColorsBuffer,
  updateInstanceInfoBufferAndBindGroup,
} from './buffers.ts';
import { createBezier } from './bezier.ts';
import { root } from './root.ts';
import { mainFragment, mainVertex } from './shaderModules.ts';
import {
  animationDuration,
  createGridParams,
  gridParams,
  initTileDensity,
  updateAnimationDuration,
} from './config.ts';

const ease = createBezier(0.18, 0.7, 0.68, 1.03);

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const pipeline = root['~unstable']
  .withVertex(mainVertex)
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

// main drawing loop
let isRunning = true;

function getShiftedColors(timestamp: number) {
  const shiftBy = Math.floor(timestamp / animationDuration) % colors.length;
  return [...colors.slice(shiftBy), ...colors.slice(0, shiftBy)];
}

function draw(timestamp: number) {
  if (!isRunning) return;

  shiftedColorsBuffer.write(getShiftedColors(timestamp));
  animationProgressUniform.write(
    ease((timestamp % animationDuration) / animationDuration),
  );

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(getInstanceInfoBindGroup())
    .draw(9, gridParams.triangleCount);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

// cleanup

const resizeObserver = new ResizeObserver(() => {});

resizeObserver.observe(canvas);

export function onCleanup() {
  isRunning = false;

  resizeObserver.disconnect();
  root.destroy();
}

// Example controls and cleanup

export const controls = {
  'tile density': {
    initial: initTileDensity,
    min: 0.01,
    max: 1,
    step: 0.01,
    onSliderChange: (newValue: number) => {
      Object.assign(gridParams, createGridParams(newValue));
      gridParamsBuffer.write(gridParams);
      updateInstanceInfoBufferAndBindGroup();
    },
  },
  'animation duration': {
    initial: animationDuration,
    min: 250,
    max: 2500,
    step: 25,
    onSliderChange: (newValue: number) => {
      updateAnimationDuration(newValue);
    },
  },
};

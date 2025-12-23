import { colors } from './geometry.ts';
import { animationProgressUniform, shiftedColorsBuffer } from './buffers.ts';
import { createBezier } from './bezier.ts';
import { root } from './root.ts';
import { mainFragment, mainVertex, maskVertex } from './shaderModules.ts';
import { ANIMATION_DURATION, TRIANGLE_COUNT } from './consts.ts';

const ease = createBezier(0.18, 0.7, 0.68, 1.03);

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let stencilTexture = root.device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'stencil8',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

const maskPipeline = root['~unstable']
  .withVertex(maskVertex)
  .withDepthStencil({
    format: 'stencil8',
    stencilFront: {
      compare: 'always',
      passOp: 'replace',
    },
  })
  .createPipeline()
  .withStencilReference(1);

const pipeline = root['~unstable']
  .withVertex(mainVertex)
  .withFragment(mainFragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'stencil8',
    stencilFront: {
      compare: 'equal',
      passOp: 'keep',
      failOp: 'keep',
    },
  })
  .createPipeline()
  .withStencilReference(1);

// main drawing loop
let isRunning = true;

function getShiftedColors(timestamp: number) {
  const shiftBy = Math.floor(timestamp / ANIMATION_DURATION) % colors.length;
  return [...colors.slice(shiftBy), ...colors.slice(0, shiftBy)];
}

function draw(timestamp: number) {
  if (!isRunning) return;

  shiftedColorsBuffer.write(getShiftedColors(timestamp));
  animationProgressUniform.write(
    ease((timestamp % ANIMATION_DURATION) / ANIMATION_DURATION),
  );

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: stencilTexture.createView(),
      stencilLoadOp: 'load',
      stencilStoreOp: 'store',
    })
    .draw(9, TRIANGLE_COUNT);

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// cleanup

const resizeObserver = new ResizeObserver(() => {
  stencilTexture.destroy();

  stencilTexture = root.device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  maskPipeline
    .withDepthStencilAttachment({
      view: stencilTexture.createView(),
      stencilClearValue: 0,
      stencilLoadOp: 'clear',
      stencilStoreOp: 'store',
    })
    .draw(3, TRIANGLE_COUNT);
});
resizeObserver.observe(canvas);

export function onCleanup() {
  isRunning = false;

  resizeObserver.disconnect();
  root.destroy();
}

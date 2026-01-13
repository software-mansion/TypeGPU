import { colors } from './geometry.ts';
import {
  animationProgressUniform,
  drawOverNeighborsBuffer,
  getInstanceInfoBindGroup,
  shiftedColorsBuffer,
  updateInstanceInfoBufferAndBindGroup,
} from './buffers.ts';
import { createBezier } from './bezier.ts';
import { root } from './root.ts';
import {
  backgroundFragment,
  backgroundVertex,
  foregroundFragment,
  foregroundVertex,
  midgroundFragment,
  midgroundVertex,
} from './shaderModules.ts';
import {
  getAnimationDuration,
  getCubicBezierControlPoints,
  getCubicBezierControlPointsString,
  gridParams,
  INIT_TILE_DENSITY,
  INITIAL_STEP_ROTATION,
  parseControlPoints,
  ROTATION_OPTIONS,
  updateAnimationDuration,
  updateAspectRatio,
  updateGridParams,
  updateStepRotation,
} from './params.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

let ease = createBezier(getCubicBezierControlPoints());
updateAspectRatio(canvas.width, canvas.height);

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const backgroundPipeline = root['~unstable']
  .withVertex(backgroundVertex)
  .withFragment(backgroundFragment, { format: presentationFormat })
  .createPipeline();

const midgroundPipeline = root['~unstable']
  .withVertex(midgroundVertex)
  .withFragment(midgroundFragment, { format: presentationFormat })
  .createPipeline();

const foregroundPipeline = root['~unstable']
  .withVertex(foregroundVertex)
  .withFragment(foregroundFragment, { format: presentationFormat })
  .createPipeline();

// main drawing loop
let isRunning = true;

function getShiftedColors(timestamp: number) {
  const shiftBy = Math.floor(timestamp / getAnimationDuration()) %
    colors.length;
  return [...colors.slice(shiftBy), ...colors.slice(0, shiftBy)];
}

function draw(timestamp: number) {
  if (!isRunning) return;

  shiftedColorsBuffer.write(getShiftedColors(timestamp));
  animationProgressUniform.write(
    ease((timestamp % getAnimationDuration()) / getAnimationDuration()),
  );

  const view = context.getCurrentTexture().createView();

  backgroundPipeline
    .withColorAttachment(
      {
        view,
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ).draw(6);

  midgroundPipeline
    .withColorAttachment({
      view,
      loadOp: 'load',
      storeOp: 'store',
    })
    .with(getInstanceInfoBindGroup())
    .draw(3, gridParams.triangleCount);

  foregroundPipeline
    .withColorAttachment({
      view,
      loadOp: 'load',
      storeOp: 'store',
    })
    .with(getInstanceInfoBindGroup())
    .draw(3, gridParams.triangleCount);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

// cleanup

const resizeObserver = new ResizeObserver(() => {
  updateAspectRatio(canvas.width, canvas.height);
  updateGridParams();
  updateInstanceInfoBufferAndBindGroup();
});

resizeObserver.observe(canvas);

export function onCleanup() {
  isRunning = false;

  resizeObserver.disconnect();
  root.destroy();
}

// Example controls

export const controls = {
  'Tile density': {
    initial: INIT_TILE_DENSITY,
    min: 0.01,
    max: 1,
    step: 0.01,
    onSliderChange: updateGridParams,
  },
  'Animation duration': {
    initial: getAnimationDuration(),
    min: 250,
    max: 3500,
    step: 25,
    onSliderChange: updateAnimationDuration,
  },
  'Rotation in degrees': {
    initial: INITIAL_STEP_ROTATION,
    options: ROTATION_OPTIONS,
    onSelectChange: updateStepRotation,
  },
  'Draw over neighbors': {
    initial: false,
    onToggleChange(value: boolean) {
      drawOverNeighborsBuffer.write(value ? 1 : 0);
    },
  },
  'Cubic Bezier Control Points': {
    initial: getCubicBezierControlPointsString(),
    async onTextChange(value: string) {
      const newPoints = parseControlPoints(value);

      ease = createBezier(
        newPoints,
      );
    },
  },
  'Edit Cubic Bezier Points': {
    onButtonClick: () => {
      window.open(
        `https://cubic-bezier.com/?#${getCubicBezierControlPoints().join()}`,
        '_blank',
      );
    },
  },
};

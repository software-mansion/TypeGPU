import { colors } from './geometry.ts';
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
  getGridParams,
  INIT_TILE_DENSITY,
  INITIAL_STEP_ROTATION,
  parseControlPoints,
  ROTATION_OPTIONS,
  updateAnimationDuration,
  updateAspectRatio,
  updateGridParams,
  updateStepRotation,
} from './params.ts';
import {
  animationProgressAccess,
  aspectRatioAccess,
  createBuffers,
  drawOverNeighborsAccess,
  middleSquareScaleAccess,
  scaleAccess,
  shiftedColorsAccess,
  stepRotationAccess,
} from './buffers.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

let ease = createBezier(getCubicBezierControlPoints());

const {
  aspectRatioBuffer,
  animationProgressUniform,
  drawOverNeighborsBuffer,
  getInstanceInfoBindGroup,
  scaleBuffer,
  shiftedColorsBuffer,
  middleSquareScaleBuffer,
  updateInstanceInfoBufferAndBindGroup,
  stepRotationBuffer,
} = createBuffers(root);

updateAspectRatio(canvas.width, canvas.height, aspectRatioBuffer);

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const backgroundPipeline = root['~unstable']
  .with(shiftedColorsAccess, shiftedColorsBuffer)
  .withVertex(backgroundVertex)
  .withFragment(backgroundFragment, { format: presentationFormat })
  .createPipeline();

const midgroundPipeline = root['~unstable']
  .with(animationProgressAccess, animationProgressUniform)
  .with(stepRotationAccess, stepRotationBuffer)
  .with(drawOverNeighborsAccess, drawOverNeighborsBuffer)
  .with(shiftedColorsAccess, shiftedColorsBuffer)
  .with(middleSquareScaleAccess, middleSquareScaleBuffer)
  .with(scaleAccess, scaleBuffer)
  .with(aspectRatioAccess, aspectRatioBuffer)
  .withVertex(midgroundVertex)
  .withFragment(midgroundFragment, { format: presentationFormat })
  .createPipeline();

const foregroundPipeline = root['~unstable']
  .with(drawOverNeighborsAccess, drawOverNeighborsBuffer)
  .with(animationProgressAccess, animationProgressUniform)
  .with(stepRotationAccess, stepRotationBuffer)
  .with(shiftedColorsAccess, shiftedColorsBuffer)
  .with(scaleAccess, scaleBuffer)
  .with(aspectRatioAccess, aspectRatioBuffer)
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
    .draw(3, getGridParams().triangleCount);

  foregroundPipeline
    .withColorAttachment({
      view,
      loadOp: 'load',
      storeOp: 'store',
    })
    .with(getInstanceInfoBindGroup())
    .draw(3, getGridParams().triangleCount);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

// cleanup

const resizeObserver = new ResizeObserver(() => {
  updateAspectRatio(canvas.width, canvas.height, aspectRatioBuffer);
  updateGridParams(scaleBuffer, updateInstanceInfoBufferAndBindGroup);
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
    max: 1.33,
    step: 0.01,
    onSliderChange: (newValue: number) =>
      updateGridParams(
        scaleBuffer,
        updateInstanceInfoBufferAndBindGroup,
        newValue,
      ),
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
    onSelectChange: (newValue: number) =>
      updateStepRotation(newValue, stepRotationBuffer, middleSquareScaleBuffer),
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

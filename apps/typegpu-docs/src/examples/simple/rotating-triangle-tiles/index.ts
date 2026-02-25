import { colors } from './geometry.ts';
import { createBezier } from './bezier.ts';
import {
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
  updateCubicBezierControlPoints,
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
import tgpu from 'typegpu';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

let ease = createBezier(getCubicBezierControlPoints());

export const root = await tgpu.init();

const {
  aspectRatioUniform,
  animationProgressUniform,
  drawOverNeighborsUniform,
  getInstanceInfoBindGroup,
  scaleUniform,
  shiftedColorsUniform,
  middleSquareScaleUniform,
  updateInstanceInfoBufferAndBindGroup,
  stepRotationUniform,
} = createBuffers(root);

updateAspectRatio(canvas.width, canvas.height, aspectRatioUniform);

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const midgroundPipeline = root['~unstable']
  .with(animationProgressAccess, animationProgressUniform)
  .with(stepRotationAccess, stepRotationUniform)
  .with(drawOverNeighborsAccess, drawOverNeighborsUniform)
  .with(shiftedColorsAccess, shiftedColorsUniform)
  .with(middleSquareScaleAccess, middleSquareScaleUniform)
  .with(scaleAccess, scaleUniform)
  .with(aspectRatioAccess, aspectRatioUniform)
  .withVertex(midgroundVertex)
  .withFragment(midgroundFragment, { format: presentationFormat })
  .createPipeline();

const foregroundPipeline = root['~unstable']
  .with(drawOverNeighborsAccess, drawOverNeighborsUniform)
  .with(animationProgressAccess, animationProgressUniform)
  .with(stepRotationAccess, stepRotationUniform)
  .with(shiftedColorsAccess, shiftedColorsUniform)
  .with(scaleAccess, scaleUniform)
  .with(aspectRatioAccess, aspectRatioUniform)
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

  const shiftedColors = getShiftedColors(timestamp);

  shiftedColorsUniform.write(shiftedColors);
  animationProgressUniform.write(
    ease((timestamp % getAnimationDuration()) / getAnimationDuration()),
  );

  const view = context.getCurrentTexture().createView();

  midgroundPipeline
    .withColorAttachment({
      view,
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: shiftedColors[0],
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
  updateAspectRatio(canvas.width, canvas.height, aspectRatioUniform);
  updateGridParams(scaleUniform, updateInstanceInfoBufferAndBindGroup);
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
        scaleUniform,
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
      updateStepRotation(
        newValue,
        stepRotationUniform,
        middleSquareScaleUniform,
      ),
  },
  'Draw over neighbors': {
    initial: false,
    onToggleChange(value: boolean) {
      drawOverNeighborsUniform.write(value ? 1 : 0);
    },
  },
  'Cubic Bezier Control Points': {
    initial: getCubicBezierControlPointsString(),
    async onTextChange(value: string) {
      const newPoints = parseControlPoints(value);

      updateCubicBezierControlPoints(newPoints);
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

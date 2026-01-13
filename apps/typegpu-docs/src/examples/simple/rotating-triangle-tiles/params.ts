import * as d from 'typegpu/data';
import {
  aspectRatioBuffer,
  middleSquareScaleBuffer,
  scaleBuffer,
  stepRotationBuffer,
  updateInstanceInfoBufferAndBindGroup,
} from './buffers.ts';
import { MAGIC_NUMBER } from './geometry.ts';

const INIT_TILE_DENSITY = 0.1;
const INITIAL_STEP_ROTATION = 60;
const INITIAL_MIDDLE_SQUARE_SCALE = 2;
const DEFAULT_ROTATION_TO_MIDDLE_SQUARE_SCALE_ARRAY = 2;

let cubicBezierControlPoints: [number, number, number, number] = [
  0.18,
  0.7,
  0.68,
  1.03,
];

function getCubicBezierControlPoints() {
  return cubicBezierControlPoints;
}

function getCubicBezierControlPointsString() {
  return cubicBezierControlPoints.map((value) =>
    String(value).replace(/^0(?=\.)/, '')
  ).join(', ');
}

function parseControlPoints(value: string) {
  const points = value.split(',');
  return points.map((point, index) => parseOneControlPoint(point, index));
}

function parseOneControlPoint(value: string, index: number) {
  const parsedNumber = Number(value);
  console.log(parsedNumber);
  if (isNaN(parsedNumber)) {
    throw Error('Cubic Bezier control point must be a number');
  }
  if ((index % 2 === 0) && (parsedNumber < 0 || parsedNumber > 1)) {
    throw Error('Cubic Bezier control point must be a value between 0 and 1');
  }

  return parsedNumber;
}

let aspectRatio = 1;

function updateAspectRatio(width: number, height: number) {
  aspectRatio = width / height;
  aspectRatioBuffer.write(aspectRatio);
}

let animationDuration = 1000;

function getAnimationDuration() {
  return animationDuration;
}

const ROTATION_TO_MIDDLE_SQUARE_SCALE_ARRAY = [
  [0, 1.5],
  [60, 2],
  [120, 2],
  [180, 3],
];

const ROTATION_OPTIONS = ROTATION_TO_MIDDLE_SQUARE_SCALE_ARRAY.flatMap(
  (element) => element[0],
);

function updateStepRotation(newValue: number) {
  stepRotationBuffer.write(newValue);

  // update middle triangle scale so that it doesn't
  // show already hidden color

  const scale = ROTATION_TO_MIDDLE_SQUARE_SCALE_ARRAY.find((element) =>
    element[0] === newValue
  )?.[1];

  middleSquareScaleBuffer.write(
    scale ?? DEFAULT_ROTATION_TO_MIDDLE_SQUARE_SCALE_ARRAY,
  );
}

const GridParams = d.struct({
  tileDensity: d.f32,
  userScale: d.f32,
  trianglesPerRow: d.u32,
  triangleCount: d.u32,
});

let gridParams = createGridParams(INIT_TILE_DENSITY);

function getGridParams() {
  return gridParams;
}

function updateGridParams(newValue?: number) {
  const value = newValue ?? gridParams.tileDensity;
  gridParams = createGridParams(value);
  scaleBuffer.write(gridParams.tileDensity);
  updateInstanceInfoBufferAndBindGroup();
}

// snugly put all of the triangles inside the canvas
function createGridParams(tileDensity: number) {
  const trianglesPerColumn = Math.ceil(MAGIC_NUMBER / tileDensity);
  const trianglesPerRow = Math.ceil(trianglesPerColumn * aspectRatio * 2);

  return {
    tileDensity,
    trianglesPerRow,
    triangleCount: trianglesPerColumn * trianglesPerRow,
  };
}

function updateAnimationDuration(newValue: number) {
  animationDuration = newValue;
}

export {
  createGridParams,
  getAnimationDuration,
  getCubicBezierControlPoints,
  getCubicBezierControlPointsString,
  getGridParams,
  GridParams,
  INIT_TILE_DENSITY,
  INITIAL_MIDDLE_SQUARE_SCALE,
  INITIAL_STEP_ROTATION,
  parseControlPoints,
  ROTATION_OPTIONS,
  updateAnimationDuration,
  updateAspectRatio,
  updateGridParams,
  updateStepRotation,
};

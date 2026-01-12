import * as d from 'typegpu/data';
import {
  aspectRatioBuffer,
  scaleBuffer,
  updateInstanceInfoBufferAndBindGroup,
} from './buffers.ts';

const initAnimationDuration = 1000;
const initTileDensity = 0.1;
const STEP_ROTATION_ANGLE = 60;

let aspectRatio = 1;

function updateAspectRatio(width: number, height: number) {
  aspectRatio = width / height;
  aspectRatioBuffer.write(aspectRatio);
}

let animationDuration = initAnimationDuration;

const GridParams = d.struct({
  tileDensity: d.f32,
  userScale: d.f32,
  trianglesPerRow: d.u32,
  triangleCount: d.u32,
});

let gridParams = createGridParams(initTileDensity);

function updateGridParams(newValue?: number) {
  const value = newValue ?? gridParams.tileDensity;
  gridParams = createGridParams(value);
  scaleBuffer.write(gridParams.tileDensity);
  updateInstanceInfoBufferAndBindGroup();
}

// snugly put all of the triangles inside the canvas
function createGridParams(tileDensity: number) {
  const MAGIC_NUMBER = 1.331;
  const userScale = tileDensity;
  const trianglesPerColumn = Math.ceil(MAGIC_NUMBER / userScale);
  const trianglesPerRow = Math.ceil(trianglesPerColumn * aspectRatio * 2);

  return {
    tileDensity,
    userScale,
    trianglesPerRow,
    triangleCount: trianglesPerColumn * trianglesPerRow,
  };
}

function updateAnimationDuration(newValue: number) {
  animationDuration = newValue;
}

export {
  animationDuration,
  createGridParams,
  GridParams,
  gridParams,
  initTileDensity,
  STEP_ROTATION_ANGLE,
  updateAnimationDuration,
  updateAspectRatio,
  updateGridParams,
};

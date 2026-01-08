import * as d from 'typegpu/data';

const initAnimationDuration = 1500;
const initTileDensity = 0.1;
const STEP_ROTATION_ANGLE = 60;

let animationDuration = initAnimationDuration;

const GridParams = d.struct({
  tileDensity: d.f32,
  userScale: d.f32,
  trianglesPerRow: d.u32,
  triangleCount: d.u32,
});

let gridParams = createGridParams(initTileDensity);

function createGridParams(tileDensity: number) {
  const MAGIC_NUMBER = 0.443;
  const userScale = tileDensity * 1.0001;
  const trianglesPerRow = 6 * Math.ceil(MAGIC_NUMBER / userScale);

  return {
    tileDensity,
    userScale,
    trianglesPerRow,
    triangleCount: trianglesPerRow ** 2 / 2,
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
  STEP_ROTATION_ANGLE,
  initTileDensity,
  updateAnimationDuration
};

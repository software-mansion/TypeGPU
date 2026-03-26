import { d } from 'typegpu';
import { gridParams } from './params.ts';
import {
  BASE_TRIANGLE_CENTROID_TO_MIDPOINT_LENGTH,
  BASE_TRIANGLE_HALF_SIDE,
  BASE_TRIANGLE_HEIGHT,
} from './geometry.ts';

const InstanceInfoArray = d.arrayOf(d.mat3x3f);

function createRotationScaleMatrix(scale: number, angleInDegrees: number) {
  const angle = (angleInDegrees * Math.PI) / 180;
  const cosAngle = Math.cos(angle) * scale;
  const sinAngle = Math.sin(angle) * scale;

  return d.mat3x3f(
    d.vec3f(cosAngle, sinAngle, 0),
    d.vec3f(-sinAngle, cosAngle, 0),
    d.vec3f(0, 0, 1),
  );
}

function createTranslationMatrix(x: number, y: number) {
  return d.mat3x3f(d.vec3f(1, 0, 0), d.vec3f(0, 1, 0), d.vec3f(x, y, 1));
}

function createAspectMatrix(aspectRatio: number) {
  return d.mat3x3f(d.vec3f(1 / aspectRatio, 0, 0), d.vec3f(0, 1, 0), d.vec3f(0, 0, 1));
}

function createInstanceInfoArrays(aspectRatio: number) {
  const tileDensity = gridParams.tileDensity;
  const zeroOffset = d.vec2f(BASE_TRIANGLE_HALF_SIDE * tileDensity - aspectRatio, 1 - tileDensity);
  const aspectMatrix = createAspectMatrix(aspectRatio);
  const allRows: d.m3x3f[] = [];
  const checkerboardGroups: d.m3x3f[][] = [[], [], [], []];

  for (let index = 0; index < gridParams.triangleCount; index++) {
    const row = Math.floor(index / gridParams.trianglesPerRow);
    const column = index % gridParams.trianglesPerRow;

    const offsetX = (column - 1) * BASE_TRIANGLE_HALF_SIDE * tileDensity;
    const offsetY = -row * BASE_TRIANGLE_HEIGHT * tileDensity * 0.9999;

    const isOddColumn = column % 2 === 1;
    const translation = createTranslationMatrix(
      offsetX + zeroOffset.x,
      offsetY +
        zeroOffset.y +
        (isOddColumn ? BASE_TRIANGLE_CENTROID_TO_MIDPOINT_LENGTH * tileDensity : 0),
    );
    const transform = aspectMatrix
      .mul(translation)
      .mul(createRotationScaleMatrix(tileDensity, isOddColumn ? 60 : 0));

    allRows.push(transform);
    checkerboardGroups[(row % 2) * 2 + (column % 2)].push(transform);
  }

  return { allRows, checkerboardGroups };
}

export { createInstanceInfoArrays, InstanceInfoArray };

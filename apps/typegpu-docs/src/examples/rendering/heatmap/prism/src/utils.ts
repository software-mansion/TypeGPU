import * as d from 'typegpu/data';

import type * as s from './structures.ts';

export function createTransformMatrix(
  translation: d.v3f,
  scale: d.v3f,
): d.Infer<typeof s.Transform> {
  return {
    model: d.mat4x4f.translation(translation).mul(d.mat4x4f.scaling(scale)),
  };
}

export function createLineListFromTriangleList(
  indexBufferData: number[],
): number[] {
  const lineList = [];
  for (let i = 0; i < indexBufferData.length; i += 3) {
    lineList.push(
      indexBufferData[i],
      indexBufferData[i + 1],
      indexBufferData[i + 1],
      indexBufferData[i + 2],
      indexBufferData[i + 2],
      indexBufferData[i],
    );
  }
  return lineList;
}

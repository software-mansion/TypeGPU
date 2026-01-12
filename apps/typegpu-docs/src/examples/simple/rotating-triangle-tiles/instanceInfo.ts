import * as d from 'typegpu/data';
import { gridParams } from './config.ts';
import {
  baseTriangleCentroidToMidpointLength,
  baseTriangleHalfHeight,
  baseTriangleSide,
} from './geometry.ts';

const InstanceInfo = d.struct({ offset: d.vec2f, rotationAngle: d.f32 });
const InstanceInfoArray = d.arrayOf(InstanceInfo);

function createInstanceInfoArray() {
  const instanceInfoArray = Array.from(
    { length: gridParams.triangleCount },
    (_, index) => {
      const row = Math.floor(index / gridParams.trianglesPerRow);
      const column = index % gridParams.trianglesPerRow;

      let info: d.Infer<typeof InstanceInfo>;

      const offsetX = (column - 1) * baseTriangleHalfHeight *
        gridParams.userScale;

      if (column % 2 === 1) {
        info = {
          offset: d.vec2f(
            offsetX,
            baseTriangleCentroidToMidpointLength * gridParams.userScale,
          ),
          rotationAngle: 60,
        };
      } else {
        info = {
          offset: d.vec2f(offsetX, 0),
          rotationAngle: 0,
        };
      }

      info.offset.y += -row * baseTriangleSide * gridParams.userScale;
      // hide empty pixel lines
      info.offset.y *= 0.9999;

      return info;
    },
  );

  return instanceInfoArray;
}

export { createInstanceInfoArray, InstanceInfo, InstanceInfoArray };

import * as d from 'typegpu/data';
import { getGridParams } from './params.ts';
import {
  BASE_TRIANGLE_CENTROID_TO_MIDPOINT_LENGTH,
  BASE_TRIANGLE_HALF_SIDE,
  BASE_TRIANGLE_HEIGHT,
} from './geometry.ts';

const InstanceInfo = d.struct({ offset: d.vec2f, rotationAngle: d.f32 });
const InstanceInfoArray = d.arrayOf(InstanceInfo);

function createInstanceInfoArray() {
  const instanceInfoArray = Array.from(
    { length: getGridParams().triangleCount },
    (_, index) => {
      const row = Math.floor(index / getGridParams().trianglesPerRow);
      const column = index % getGridParams().trianglesPerRow;

      let info: d.Infer<typeof InstanceInfo>;

      const offsetX = (column - 1) * BASE_TRIANGLE_HALF_SIDE *
        getGridParams().tileDensity;

      if (column % 2 === 1) {
        info = {
          offset: d.vec2f(
            offsetX,
            BASE_TRIANGLE_CENTROID_TO_MIDPOINT_LENGTH *
              getGridParams().tileDensity,
          ),
          rotationAngle: 60,
        };
      } else {
        info = {
          offset: d.vec2f(offsetX, 0),
          rotationAngle: 0,
        };
      }

      info.offset.y += -row * BASE_TRIANGLE_HEIGHT *
        getGridParams().tileDensity;
      // hide empty pixel lines
      info.offset.y *= 0.9999;

      return info;
    },
  );

  return instanceInfoArray;
}

export { createInstanceInfoArray, InstanceInfo, InstanceInfoArray };

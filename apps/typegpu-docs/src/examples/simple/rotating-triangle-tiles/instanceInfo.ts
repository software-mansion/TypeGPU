import * as d from 'typegpu/data';
import {
  SCALE,
  TRIANGLE_COUNT,
  TRIANGLES_PER_ROW,
  USER_SCALE,
} from './consts.ts';

const InstanceInfo = d.struct({ offset: d.vec2f, rotationAngle: d.f32 });
const InstanceInfoArray = d.arrayOf(InstanceInfo, TRIANGLE_COUNT);

const instanceInfoArray = Array.from({ length: TRIANGLE_COUNT }, (_, index) => {
  const row = Math.floor(index / TRIANGLES_PER_ROW);
  const column = index % TRIANGLES_PER_ROW;

  const info = InstanceInfo(
    column % 2 === 1
      ? {
          offset: d.vec2f(
            (column - 1) * Math.sqrt(3) * SCALE * USER_SCALE,
            1 * SCALE * USER_SCALE,
          ),
          rotationAngle: 60,
        }
      : {
          offset: d.vec2f((column - 1) * Math.sqrt(3) * SCALE * USER_SCALE, 0),
          rotationAngle: 0,
        },
  );

  info.offset.y += -row * 3 * SCALE * USER_SCALE;

  return info;
});

export { instanceInfoArray, InstanceInfoArray, InstanceInfo };

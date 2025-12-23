import * as d from 'typegpu/data';
import { SCALE, TRIANGLE_COUNT } from './consts.ts';

const InstanceInfo = d.struct({ offset: d.vec2f, rotationAngle: d.f32 });
const InstanceInfoArray = d.arrayOf(InstanceInfo, TRIANGLE_COUNT);

const instanceInfoArray = Array.from({ length: TRIANGLE_COUNT }, (_, index) => {
  const info = InstanceInfo({
    offset: d.vec2f(index * 2 * Math.sqrt(3) * SCALE, 0),
    rotationAngle: index % 2 === 1 ? 120 : 0,
  });
  return info;
});

export { instanceInfoArray, InstanceInfoArray };

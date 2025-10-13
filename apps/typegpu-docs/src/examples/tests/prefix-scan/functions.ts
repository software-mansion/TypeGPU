import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const addFn = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => {
  return a + b;
});

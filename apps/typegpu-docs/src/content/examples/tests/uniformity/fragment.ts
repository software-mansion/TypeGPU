import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randf } from '@typegpu/noise';

import * as c from './constants.ts';

export const fullScreenGridFragmentShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = input.uv.add(1).div(2);
  const gridedUV = std.floor(uv.mul(c.gridSize));

  randf.seed2(gridedUV);

  return d.vec4f(d.vec3f(randf.sample()), 1.0);
});

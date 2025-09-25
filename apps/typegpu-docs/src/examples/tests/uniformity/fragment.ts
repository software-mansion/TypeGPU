import tgpu from 'typegpu';
import type { TgpuUniform } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randf } from '@typegpu/noise';

export const bindFullScreenGridFSWithUniforms = (
  gridSizeUniform: TgpuUniform<d.F32>,
  canvasRatioUniform: TgpuUniform<d.F32>,
) =>
  tgpu['~unstable'].fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    const uv = input.uv.add(1).div(2).mul(d.vec2f(canvasRatioUniform.$, 1));
    const gridedUV = std.floor(uv.mul(gridSizeUniform.$));

    randf.seed2(gridedUV);

    return d.vec4f(d.vec3f(randf.sample()), 1.0);
  });

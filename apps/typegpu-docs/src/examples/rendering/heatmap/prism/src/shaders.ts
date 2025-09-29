import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

import { layout } from './layouts.ts';

export const vertexFn = tgpu['~unstable'].vertexFn({
  in: { position: d.vec4f, color: d.vec4f },
  out: { pos: d.builtin.position, color: d.vec4f },
})((input) => {
  const pos = std.mul(
    layout.$.camera.projection,
    std.mul(
      layout.$.camera.view,
      std.mul(layout.$.transform.model, input.position),
    ),
  );
  return { pos, color: input.color };
});

export const fragmentFn = tgpu['~unstable'].fragmentFn({
  in: { color: d.vec4f },
  out: d.vec4f,
})((input) => input.color);

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

export const lineVertexFn = tgpu['~unstable'].vertexFn({
  in: { position: d.vec4f, edgeColor: d.vec4f },
  out: { pos: d.builtin.position, edgeColor: d.vec4f },
})((input) => {
  const pos = std.mul(
    layout.$.camera.projection,
    std.mul(
      layout.$.camera.view,
      std.mul(layout.$.transform.model, input.position),
    ),
  );
  return { pos: pos.add(d.vec4f(0, 0.001, 0, 0)), edgeColor: input.edgeColor };
});

export const lineFragmentFn = tgpu['~unstable'].fragmentFn({
  in: { edgeColor: d.vec4f },
  out: d.vec4f,
})((input) => {
  return input.edgeColor;
});

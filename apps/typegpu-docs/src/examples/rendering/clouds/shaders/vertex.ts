import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const mainVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [
    d.vec2f(-1.0, 1.0),
    d.vec2f(-1.0, -1.0),
    d.vec2f(1.0, -1.0),
    d.vec2f(-1.0, 1.0),
    d.vec2f(1.0, -1.0),
    d.vec2f(1.0, 1.0),
  ];

  const uv = [
    d.vec2f(0.0, 1.0),
    d.vec2f(0.0, 0.0),
    d.vec2f(1.0, 0.0),
    d.vec2f(0.0, 1.0),
    d.vec2f(1.0, 0.0),
    d.vec2f(1.0, 1.0),
  ];

  return {
    outPos: d.vec4f(pos[input.vertexIndex], 0.0, 1.0),
    uv: uv[input.vertexIndex],
  };
});

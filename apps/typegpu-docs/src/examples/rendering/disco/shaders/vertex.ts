import tgpu, { d } from 'typegpu';

export const mainVertex = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position, uv: d.vec2f },
})(({ vertexIndex }) => {
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
  return { outPos: d.vec4f(pos[vertexIndex], 0.0, 1.0), uv: uv[vertexIndex] };
});

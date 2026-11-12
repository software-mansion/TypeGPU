import { d, tgpu } from 'typegpu';

const pos = tgpu.const(d.arrayOf(d.vec2f), [
  d.vec2f(0.0, 0.5),
  d.vec2f(-0.5, -0.5),
  d.vec2f(0.5, -0.5),
]);

export const geometryVertexFn = tgpu.vertexFn({
  in: { vId: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, color: d.vec4f, normal: d.vec4f },
})(({ vId }) => {
  return { pos: d.vec4f(pos.$[vId], 0, 1), color: d.vec4f(), normal: d.vec4f() };
});

export const geometryFragmentFn = tgpu.fragmentFn({
  in: { pos: d.builtin.position, normal: d.vec4f },
  out: { position: d.vec4f, normal: d.vec4f, albedo: d.vec4f },
})(({ pos, normal }) => {
  return { position: pos, normal, albedo: d.vec4f(1, 0, 0, 1) };
});

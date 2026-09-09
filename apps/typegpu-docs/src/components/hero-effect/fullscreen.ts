import { tgpu, d } from 'typegpu';

// Authored in TypeScript so the same entrypoint can resolve to WGSL and GLSL.
export const fullScreenTriangle = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.vec2f },
})(({ vertexIndex }) => {
  'use gpu';
  const uv = d.vec2f((vertexIndex << 1) & 2, vertexIndex & 2);
  return { position: d.vec4f(uv * 2 - 1, 0, 1), uv: d.vec2f(uv.x, 1 - uv.y) };
});

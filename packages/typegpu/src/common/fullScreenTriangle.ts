import { builtin } from '../builtin.ts';
import { vertexFn } from '../core/function/tgpuVertexFn.ts';
import { vec2f } from '../data/vector.ts';

/**
 * A vertex function that defines a single full-screen triangle out
 * of three points.
 *
 * @example
 * ```ts
 * import { common } from 'typegpu';
 *
 * const pipeline = root.createRenderPipeline({
 *   vertex: common.fullScreenTriangle,
 *   fragment: yourFragmentShader,
 * });
 *
 * pipeline.draw(3);
 * ```
 */
export const fullScreenTriangle = vertexFn({
  in: { vertexIndex: builtin.vertexIndex },
  out: { pos: builtin.position, uv: vec2f },
})`{
  const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

  return Out(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
}`;

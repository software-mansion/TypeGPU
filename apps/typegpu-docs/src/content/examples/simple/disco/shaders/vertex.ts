import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const mainVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position, uv: d.vec2f },
}) /* wgsl */`{
  var pos = array<vec2f, 6>(vec2(-1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), 
    vec2(1.0, -1.0),
    vec2(1.0, 1.0));
  var uv = array<vec2f, 6>(
    vec2(0.0, 1.0), 
    vec2(0.0, 0.0),  
    vec2(1.0, 0.0),  
    vec2(0.0, 1.0),
    vec2(1.0, 0.0), 
    vec2(1.0, 1.0)   
  );
  return Out(vec4f(pos[in.vertexIndex], 0.0, 1.0), uv[in.vertexIndex]);
}`;

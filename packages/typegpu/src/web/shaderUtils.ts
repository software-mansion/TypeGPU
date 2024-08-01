import { struct, vec2f, vec4f } from '../data';
import wgsl from '../wgsl';

const fullScreenOutputStruct = struct({
  '@builtin(position) position': vec4f,
  '@location(0) uv': vec2f,
});

/**
 * Useful for creating shaders that consist of one full screen rectangle geometry
 * requires running render pipeline execute method with vertexCount equal to 3
 */
export const fullScreenVertexShaderOptions = {
  args: ['@builtin(vertex_index) VertexIndex: u32'],
  code: wgsl`
      const pos = array(
        vec2(-1.0, -1.0),
        vec2(-1.0,  3.0),
        vec2( 3.0, -1.0),
      );
  
      const uv = array(
        vec2(0.0, 1.0),
        vec2(0.0, -1.0),
        vec2(2.0, 1.0),
      );
  
      var output : ${fullScreenOutputStruct};
      output.position = vec4(pos[VertexIndex], 0.0, 1.0);
      output.uv = uv[VertexIndex];
      return output;
    `,
  output: fullScreenOutputStruct,
};

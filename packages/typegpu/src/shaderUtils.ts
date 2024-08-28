import { type RenderPipelineOptions, builtin } from '.';
import { vec2f } from './data';
import wgsl from './wgsl';

/**
 * Useful for creating shaders that consist of one full screen rectangle geometry.
 */
export const fullScreenRectVertexOptions: RenderPipelineOptions['vertex'] = {
  code: wgsl`
      const pos = array(
        vec2(-1.0, -1.0),
        vec2(-1.0,  3.0),
        vec2( 3.0, -1.0),
      );
  
      const uv_ = array(
        vec2(0.0, 1.0),
        vec2(0.0, -1.0),
        vec2(2.0, 1.0),
      );
  
      let position = vec4(pos[${builtin.vertexIndex}], 0.0, 1.0);
      let uv = uv_[${builtin.vertexIndex}];
    `,
  output: {
    [builtin.position]: 'position',
    uv: vec2f,
  },
  defaultVertexCount: 3,
};

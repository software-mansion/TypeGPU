import * as d from 'typegpu/data';
import tgpu from 'typegpu';

export const Vertex = d.struct({
    position: d.vec3f,
    normal: d.vec3f,
    uv: d.vec2f,
  });
  export const Camera = d.struct({
    position: d.vec3f,
    view: d.mat4x4f,
    projection: d.mat4x4f,
  });
  
  export const bindGroupLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    // texture: { texture: 'float' },
    sampler: { sampler: 'filtering' },
  });
  
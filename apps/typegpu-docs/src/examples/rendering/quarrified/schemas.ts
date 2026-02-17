import tgpu, { d } from 'typegpu';

export const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export const CubeVertex = d.unstruct({
  position: d.vec4f,
  uv: d.vec2f,
});

export const vertexCubeLayout = tgpu.vertexLayout(
  d.disarrayOf(CubeVertex),
  'vertex',
);

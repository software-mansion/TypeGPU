import tgpu, { d } from 'typegpu';

export const ModelVertexInput = d.unstruct({
  position: d.float32x3,
  normal: d.float32x3,
  uv: d.float32x2,
});

export const modelVertexLayout = tgpu.vertexLayout(d.disarrayOf(ModelVertexInput));

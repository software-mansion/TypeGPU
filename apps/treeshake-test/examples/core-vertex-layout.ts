// Vertex layout definition
import { tgpu } from 'typegpu';
import { disarrayOf, vec3f } from 'typegpu/data';

const vertexLayout = tgpu.vertexLayout((count: number) =>
  disarrayOf(vec3f, count)
);

console.log('Vertex layout type:', typeof vertexLayout);
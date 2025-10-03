import tgpu from 'typegpu';
import * as d from 'typegpu/data';

import * as s from './structures.ts';

export const layout = tgpu.bindGroupLayout({
  camera: { uniform: s.Camera },
  transform: { uniform: s.Transform },
});

export const vertexLayout = tgpu.vertexLayout(d.arrayOf(s.Vertex));

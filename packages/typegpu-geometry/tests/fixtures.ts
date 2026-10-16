import { vi } from 'vitest';
import { d } from 'typegpu';
import type { meshes } from '@typegpu/geometry';

export const scalars: meshes.IndexedGeometry<d.F32> = {
  schema: d.f32,
  topology: 'triangle-list',
  vertexCount: 4,
  indexCount: 6,
  vertexAt: (i) => {
    'use gpu';
    return d.f32(i);
  },
  indexAt: (i) => {
    'use gpu';
    return i % 4;
  },
};

export function shaderCodes(device: GPUDevice) {
  return vi.mocked(device.createShaderModule).mock.calls.map(([{ code }]) => code);
}

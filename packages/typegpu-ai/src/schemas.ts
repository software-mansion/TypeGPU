import tgpu, { type StorageFlag, type TgpuBuffer } from 'typegpu';
import * as d from 'typegpu/data';

interface LayerData {
  shape: readonly [number] | readonly [number, number];
  buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
}

interface Layer {
  weights: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  biases: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  state: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
}


export const calculateIndex = tgpu.fn([d.vec3u, d.vec3u], d.u32)((id, nwg) =>
  id.x + id.y * nwg.x + id.z * nwg.x * nwg.y
);

export const workgroupSize = 64;

const ReadonlyFloats = {
  storage: d.arrayOf(d.f32),
  access: 'readonly',
} as const;

const MutableFloats = {
  storage: d.arrayOf(d.f32),
  access: 'mutable',
} as const;

export const ioLayout = tgpu.bindGroupLayout({
  input: ReadonlyFloats,
  output: MutableFloats,
});

export const weightsBiasesLayout = tgpu.bindGroupLayout({
  weights: ReadonlyFloats,
  biases: ReadonlyFloats,
});

import tgpu, { d, type StorageFlag, type TgpuBuffer } from 'typegpu';

export const ReadonlyFloats = {
  storage: d.arrayOf(d.f32),
  access: 'readonly',
} as const;

export const MutableFloats = {
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

export interface LayerData {
  shape: readonly [number] | readonly [number, number];
  buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
}

export interface Layer {
  weights: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  biases: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  state: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
}

export interface Network {
  layers: Layer[];
  input: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  output: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;

  inference(data: number[]): Promise<number[]>;
}

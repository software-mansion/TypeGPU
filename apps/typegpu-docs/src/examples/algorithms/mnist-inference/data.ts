import { d, type StorageFlag, type TgpuBuffer } from 'typegpu';

export interface LayerData {
  shape: readonly [number] | readonly [number, number];
  buffer: TgpuBuffer<d.WgslArray<d.F32 | d.F16>> & StorageFlag;
}

export interface Layer {
  weights: TgpuBuffer<d.WgslArray<d.F32 | d.F16>> & StorageFlag;
  biases: TgpuBuffer<d.WgslArray<d.F32 | d.F16>> & StorageFlag;
  state: TgpuBuffer<d.WgslArray<d.F32 | d.F16>> & StorageFlag;
}

export interface Network {
  layers: Layer[];
  input: TgpuBuffer<d.WgslArray<d.F32 | d.F16>> & StorageFlag;
  output: TgpuBuffer<d.WgslArray<d.F32 | d.F16>> & StorageFlag;

  inference(data: number[]): Promise<number[]>;
}

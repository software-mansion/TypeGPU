import { d } from 'typegpu';
import type { StorageFlag, TgpuBindGroup, TgpuBuffer, TgpuComputePipeline } from 'typegpu';

export const WORKGROUP_SIZE = 64;

export type Vec4Buffer = TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;
export type MaskBuffer = TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
export type PackedWeightsBuffer = TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;

export interface KernelHandle {
  pipeline: TgpuComputePipeline;
  bindGroup: TgpuBindGroup;
  workgroups: number;
}

export interface WeightedBuffers {
  src: Vec4Buffer;
  dst: Vec4Buffer;
}

export interface HeadBuffers {
  src: Vec4Buffer;
  dst: MaskBuffer;
}

export interface BinaryBuffers {
  a: Vec4Buffer;
  b: Vec4Buffer;
  dst: Vec4Buffer;
}

export interface PoolBuffers {
  src: Vec4Buffer;
  dst: Vec4Buffer;
}

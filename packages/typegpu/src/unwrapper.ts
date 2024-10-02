import type { TgpuBindGroup, TgpuBindGroupLayout } from './tgpuBindGroupLayout';
import type { TgpuBuffer } from './tgpuBuffer';
import type { AnyTgpuData } from './types';

export interface Unwrapper {
  readonly device: GPUDevice;
  unwrap(resource: TgpuBuffer<AnyTgpuData>): GPUBuffer;
  unwrap(resource: TgpuBindGroupLayout): GPUBindGroupLayout;
  unwrap(resource: TgpuBindGroup): GPUBindGroup;
}

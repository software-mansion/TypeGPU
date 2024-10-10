import type { TgpuBuffer } from './core/buffer/buffer';
import type { TgpuBindGroup, TgpuBindGroupLayout } from './tgpuBindGroupLayout';
import type { AnyTgpuData } from './types';

export interface Unwrapper {
  readonly device: GPUDevice;
  unwrap(resource: TgpuBuffer<AnyTgpuData>): GPUBuffer;
  unwrap(resource: TgpuBindGroupLayout): GPUBindGroupLayout;
  unwrap(resource: TgpuBindGroup): GPUBindGroup;
}

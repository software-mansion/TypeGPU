import { type TgpuBuffer, createBufferImpl } from './core/buffer/buffer';
import type { AnyData } from './data/dataTypes';
import type { Infer } from './shared/repr';
import type { TgpuPlum } from './tgpuPlumTypes';

/**
 * @deprecated Use the `root.createBuffer` API instead, accessible through `await tgpu.init()`
 *
 * @param typeSchema The type of data that this buffer will hold.
 * @param initial The initial value of the buffer. (optional)
 */
export function createBuffer<TData extends AnyData>(
  typeSchema: TData,
  initial?: Infer<TData> | TgpuPlum<Infer<TData>> | undefined,
): TgpuBuffer<TData>;

/**
 * @deprecated Use the `root.createBuffer` API instead, accessible through `await tgpu.init()`
 *
 * @param typeSchema The type of data that this buffer will hold.
 * @param gpuBuffer A vanilla WebGPU buffer.
 */
export function createBuffer<TData extends AnyData>(
  typeSchema: TData,
  gpuBuffer: GPUBuffer,
): TgpuBuffer<TData>;

/**
 * @deprecated Use the `root.createBuffer` API instead, accessible through `await tgpu.init()`
 */
export function createBuffer<TData extends AnyData>(
  typeSchema: TData,
  initialOrBuffer?: Infer<TData> | TgpuPlum<Infer<TData>> | GPUBuffer,
): TgpuBuffer<TData> {
  return createBufferImpl(undefined, typeSchema, initialOrBuffer);
}

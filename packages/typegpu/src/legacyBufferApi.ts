import type { Parsed } from 'typed-binary';
import { type TgpuBuffer, createBufferImpl } from './tgpuBuffer';
import type { TgpuPlum } from './tgpuPlumTypes';
import type { AnyTgpuData } from './types';

/**
 * @deprecated Use `root.createBuffer` instead.
 *
 * @param typeSchema The type of data that this buffer will hold.
 * @param initial The initial value of the buffer. (optional)
 */
export function createBuffer<TData extends AnyTgpuData>(
  typeSchema: TData,
  initial?: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined,
): TgpuBuffer<TData>;

/**
 * @deprecated Use `root.createBuffer` instead.
 *
 * @param typeSchema The type of data that this buffer will hold.
 * @param gpuBuffer A vanilla WebGPU buffer.
 */
export function createBuffer<TData extends AnyTgpuData>(
  typeSchema: TData,
  gpuBuffer: GPUBuffer,
): TgpuBuffer<TData>;

export function createBuffer<TData extends AnyTgpuData>(
  typeSchema: TData,
  initialOrBuffer?: Parsed<TData> | TgpuPlum<Parsed<TData>> | GPUBuffer,
): TgpuBuffer<TData> {
  return createBufferImpl(undefined, typeSchema, initialOrBuffer);
}
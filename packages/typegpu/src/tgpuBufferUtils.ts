import type { Parsed } from 'typed-binary';
import type { WgslBuffer } from '.';
import type { AnyWgslData, BufferUsage } from './types';
import type { Unmanaged } from './wgslBuffer';

export function write<TData extends AnyWgslData>(
  buffer: WgslBuffer<TData, BufferUsage> & Unmanaged,
  data: Parsed<TData>,
): void {
  const gpuBuffer = buffer.buffer;
  const device = buffer.device;
}

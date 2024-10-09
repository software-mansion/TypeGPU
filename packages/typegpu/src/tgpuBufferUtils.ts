import type { Parsed } from 'typed-binary';
import type { TgpuBuffer } from './core/buffer/buffer';
import type { AnyTgpuData } from './types';

export function write<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData>,
  data: Parsed<TData>,
): void {
  buffer.write(data);
}

export async function read<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData>,
): Promise<Parsed<TData>> {
  return buffer.read();
}

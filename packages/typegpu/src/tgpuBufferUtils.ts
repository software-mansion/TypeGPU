import type { TgpuBuffer } from './core/buffer/buffer';
import type { AnyData } from './data/dataTypes';
import type { Infer } from './shared/repr';

export function write<TData extends AnyData>(
  buffer: TgpuBuffer<TData>,
  data: Infer<TData>,
): void {
  buffer.write(data);
}

export async function read<TData extends AnyData>(
  buffer: TgpuBuffer<TData>,
): Promise<Infer<TData>> {
  return buffer.read();
}

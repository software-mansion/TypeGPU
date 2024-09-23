import type { TgpuBuffer, Uniform } from './tgpuBuffer';
import type { TgpuBufferUsage } from './tgpuBufferUsage';
import type { TgpuSampler } from './tgpuSampler';
import type { AnyTgpuData } from './types';

// ----------
// Public API
// ----------

export type TgpuLayoutUniform = { type: 'uniform'; data: AnyTgpuData };
export type TgpuLayoutSampler = { type: 'sampler' };
export type TgpuLayoutEntry = TgpuLayoutUniform | TgpuLayoutSampler;

export interface TgpuBindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry>,
> {
  bound: { [K in keyof Entries]: BindLayoutEntry<Entries[K]> };
  populate(
    entries: { [K in keyof Entries]: LayoutEntryToInput<Entries[K]> },
  ): TgpuBindGroup<this>;
}

export type LayoutEntryToInput<T extends TgpuLayoutEntry> =
  T extends TgpuLayoutUniform
    ?
        | TgpuBufferUsage<T['data'], 'uniform'>
        | (TgpuBuffer<T['data']> & Uniform)
        | GPUBuffer
    : T extends TgpuLayoutSampler
      ? GPUSampler
      : never;

export type BindLayoutEntry<T extends TgpuLayoutEntry> =
  T extends TgpuLayoutUniform
    ? TgpuBufferUsage<T['data'], 'uniform'>
    : T extends TgpuLayoutSampler
      ? TgpuSampler
      : never;

export type TgpuBindGroup<
  Layout extends TgpuBindGroupLayout<Record<string, TgpuLayoutEntry>>,
> = {
  readonly layout: Layout;
  unwrap: (device: GPUDevice) => GPUBindGroup;
};

export function bindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry>,
>(entries: Entries): TgpuBindGroupLayout<Entries> {
  return createBindGroupLayout(entries);
}

// --------------
// Implementation
// --------------

function createBindGroupLayout<Entries extends Record<string, TgpuLayoutEntry>>(
  entries: Entries,
): TgpuBindGroupLayout<Entries> {
  // TODO: Implement
  return undefined as unknown as TgpuBindGroupLayout<Entries>;
}

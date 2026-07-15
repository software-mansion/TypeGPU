import type { d, StorageFlag, TgpuBuffer } from 'typegpu';
import type { RunPassOptions } from '../runPass.ts';
import type { SortDirection } from './schemas.ts';

export interface RadixSorterOptions<TValue extends d.AnyWgslData = d.AnyWgslData> {
  /** Sort order. Defaults to 'ascending'. */
  direction?: SortDirection;
  /**
   * Optional payload buffer reordered alongside the keys (e.g. indices into
   * another data structure). Must have the same element count as the key buffer.
   * When omitted, the payload machinery is not built at all — a key-only sorter
   * carries zero overhead for it.
   */
  values?: TgpuBuffer<d.WgslArray<TValue>> & StorageFlag;
}

export type RadixSorterRunOptions = RunPassOptions;

export interface RadixSorter {
  /** Number of elements in the sorted buffer. */
  readonly size: number;
  /** Whether the sorter uses the subgroup-accelerated scatter path. */
  readonly usesSubgroups: boolean;
  /**
   * Sort the buffer in place — standalone by default, or into the encoder/pass
   * provided in `options` to compose the sort with other GPU work.
   */
  run(options?: RadixSorterRunOptions): void;
  /** Destroy the internal buffers owned by this sorter. */
  destroy(): void;
}

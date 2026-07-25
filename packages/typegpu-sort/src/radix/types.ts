import type { d, StorageFlag, TgpuBuffer } from 'typegpu';
import type { RunPassOptions } from '../runPass.ts';
import type { SortDirection } from './schemas.ts';

export interface RadixSorterOptions<TValue extends d.AnyWgslData = d.AnyWgslData> {
  /** Sort order. Defaults to `'ascending'` */
  direction?: SortDirection;
  /**
   * Payload buffer reordered alongside the keys, e.g. indices into another data structure.
   * Must have the same element count as the key buffer.
   */
  values?: TgpuBuffer<d.WgslArray<TValue>> & StorageFlag;
}

export type RadixSorterRunOptions = RunPassOptions;

export interface RadixSorter {
  /** Number of elements in the sorted buffer */
  readonly size: number;
  /** Sorts the buffer in place. Can be called repeatedly */
  run(options?: RadixSorterRunOptions): void;
  /** Destroys the internal buffers owned by this sorter */
  destroy(): void;
}

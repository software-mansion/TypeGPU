import type { d, StorageFlag, TgpuBuffer } from 'typegpu';
import type { Sorter } from '../types.ts';

export interface BitonicSorterOptions<TValue extends d.AnyWgslData = d.AnyWgslData> {
  /** Custom comparison function. Returns true if first argument should come before second.
   * Default: ascending order (a < b) */
  compare?: (a: number, b: number) => boolean;
  /**
   * Payload buffer reordered alongside the keys, e.g. indices into another data structure.
   * Must have the same element count as the key buffer.
   */
  values?: TgpuBuffer<d.WgslArray<TValue>> & StorageFlag;
}

export interface BitonicSorter extends Sorter {
  /** Size the keys are padded to, a power of two */
  readonly paddedSize: number;
}

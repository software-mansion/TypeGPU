import type { d, StorageFlag, TgpuBuffer } from 'typegpu';
import type { Sorter } from '../types.ts';

export interface BitonicSorterOptions<TValue extends d.AnyWgslData = d.AnyWgslData> {
  /** Custom comparison function. Returns true if first argument should come before second.
   * Default: ascending order (a < b) */
  compare?: (a: number, b: number) => boolean;
  /**
   * Value used to pad arrays to power-of-2 length. Must sort to the end with your comparator.
   * Defaults to the maximum value of the key type, which works for ascending. For descending
   * order, use the minimum value of the key type.
   */
  paddingValue?: number;
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

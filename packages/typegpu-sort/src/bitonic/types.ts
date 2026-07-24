import type { d, StorageFlag, TgpuBuffer } from 'typegpu';
import type { RunPassOptions } from '../runPass.ts';

export interface BitonicSorterOptions<TValue extends d.AnyWgslData = d.AnyWgslData> {
  /** Custom comparison function. Returns true if first argument should come before second.
   * Default: ascending order (a < b) */
  compare?: (a: number, b: number) => boolean;
  /**
   * Value used to pad arrays to power-of-2 length. Must sort to the end with your comparator.
   * Defaults to the maximum value of the key type (works for ascending). For descending
   * order, use the minimum value of the key type.
   */
  paddingValue?: number;
  /**
   * Optional payload buffer reordered alongside the keys (e.g. indices into
   * another data structure). Must have the same power-of-two element count as
   * the key buffer.
   * When omitted, the payload machinery is not built at all — a key-only sorter
   * carries zero overhead for it.
   */
  values?: TgpuBuffer<d.WgslArray<TValue>> & StorageFlag;
}

export type BitonicSorterRunOptions = RunPassOptions;

export interface BitonicSorter {
  /** Original size of the input array */
  readonly originalSize: number;
  /** Size after padding to power of 2 */
  readonly paddedSize: number;
  /** Whether the array was padded */
  readonly wasPadded: boolean;

  /** Execute the sort. Can be called repeatedly. */
  run(options?: BitonicSorterRunOptions): void;

  /** Clean up all GPU resources. */
  destroy(): void;
}

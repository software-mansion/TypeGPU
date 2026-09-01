import type { d, StorageFlag, TgpuBuffer } from 'typegpu';
import type { RadixKeyType, SortDirection } from './schemas.ts';

export interface RadixSorterOptions<
  TKey extends RadixKeyType = RadixKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
> {
  /** Sort order. Defaults to `'ascending'` */
  direction?: SortDirection;
  /**
   * Inclusive range the keys lie in, keys outside are clamped to it. Integer keys are
   * offset so `min` maps to 0 and `keyBits` defaults to the bits `max - min` needs. Float
   * keys are quantized to `keyBits` evenly spaced buckets, keys in the same bucket keep
   * their input order
   */
  range?: [min: number, max: number];
  /**
   * Number of low bits of the mapped key that decide the order. Every 8 bits cost one pass
   * over the data. Defaults to what `range` needs, or 32. Below 32 on `i32` and `f32` keys
   * only with `range` or `key`
   */
  keyBits?: number;
  /**
   * Maps a raw key to a `u32` whose numeric order is the sort order, replacing the built-in
   * map of the key type. Composes with `direction` and `keyBits`
   */
  key?: (key: number) => number;
  /**
   * Payload buffer reordered alongside the keys, e.g. indices into another data structure.
   * Must have the same element count as the key buffer.
   */
  values?: TgpuBuffer<d.WgslArray<TValue>> & StorageFlag;
  /**
   * Buffers receiving the sorted keys and values, leaving the inputs untouched. Defaults
   * to sorting in place. `values` requires `out.values` and vice versa.
   */
  out?: {
    keys: TgpuBuffer<d.WgslArray<TKey>> & StorageFlag;
    values?: TgpuBuffer<d.WgslArray<TValue>> & StorageFlag;
  };
}

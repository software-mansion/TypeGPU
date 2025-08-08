import type { AnyData } from './dataTypes.ts';

/**
 * Type utility to extract the inner type from decorated types.
 */
export type Undecorate<T> = T extends {
  readonly type: 'decorated' | 'loose-decorated';
  readonly inner: infer TInner;
} ? TInner
  : T;

/**
 * Type utility to undecorate all values in a record.
 */
export type UndecorateRecord<T extends Record<string, unknown>> = {
  [Key in keyof T]: Undecorate<T[Key]>;
};

/**
 * Runtime function to extract the inner data type from decorated types.
 * If the data is not decorated, returns the data as-is.
 */
export function undecorate(data: AnyData): AnyData {
  if (data.type === 'decorated' || data.type === 'loose-decorated') {
    return data.inner as AnyData;
  }
  return data;
}

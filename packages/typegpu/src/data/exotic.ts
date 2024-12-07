/**
 * Strips schema types down to their most basic forms. (native -> exotic)
 * This is used by schema constructors to be able to ingest native schemas (created by TypeGPU), and
 * spit out a type that matches non-native schemas as well.
 */
export type Exotic<T> = T extends { readonly '~exotic': infer TExotic }
  ? TExotic
  : T;

export type ExoticArray<T> = T extends unknown[] | []
  ? {
      [Key in keyof T]: Exotic<T[Key]>;
    }
  : T;

export type ExoticRecord<T> = T extends Record<
  string | number | symbol,
  unknown
>
  ? {
      [Key in keyof T]: Exotic<T[Key]>;
    }
  : T;

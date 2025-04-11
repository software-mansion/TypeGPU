import type { AnyData } from '../data/dataTypes';

/**
 * Extracts the inferred representation of a resource.
 * @example
 * type A = Infer<F32> // => number
 * type B = Infer<WgslArray<F32>> // => number[]
 */
export type Infer<T> = T extends { readonly '~repr': infer TRepr } ? TRepr : T;
export type InferPartial<T> = T extends { readonly '~reprPartial': infer TRepr }
  ? TRepr
  : T extends { readonly '~repr': infer TRepr }
    ? TRepr | undefined
    : T extends Record<string | number | symbol, unknown>
      ? InferPartialRecord<T>
      : T;

export type InferGPU<T> = T extends { readonly '~gpuRepr': infer TRepr }
  ? TRepr
  : Infer<T>;

export type InferRecord<T extends Record<string | number | symbol, unknown>> = {
  [Key in keyof T]: Infer<T[Key]>;
};

export type InferPartialRecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]: InferPartial<T[Key]>;
};

export type InferGPURecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]: InferGPU<T[Key]>;
};

export type MemIdentity<T> = T extends {
  readonly '~memIdent': infer TMemIdent extends AnyData;
}
  ? TMemIdent
  : T;

export type MemIdentityRecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]: MemIdentity<T[Key]>;
};

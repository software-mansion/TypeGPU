/**
 * Extracts the inferred representation of a resource.
 * @example
 * type A = Infer<F32> // => number
 * type B = Infer<TgpuArray<F32>> // => number[]
 */
export type Infer<T> = T extends { readonly '~repr': infer TRepr } ? TRepr : T;

export type InferRecord<T extends Record<string | number | symbol, unknown>> = {
  [Key in keyof T]: Infer<T[Key]>;
};

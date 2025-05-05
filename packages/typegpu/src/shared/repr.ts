export const $repr = Symbol(
  'Type token for the inferred (CPU & GPU) representation of a resource',
);

/**
 * Extracts the inferred representation of a resource.
 * For inferring types as seen by the GPU, see {@link InferGPU}
 *
 * @example
 * type A = Infer<F32> // => number
 * type B = Infer<WgslArray<F32>> // => number[]
 * type C = Infer<Atomic<U32>> // => number
 */
export type Infer<T> = T extends { readonly [$repr]: infer TRepr } ? TRepr : T;

/**
 * Extracts a sparse/partial inferred representation of a resource.
 * Used by the `buffer.writePartial` API.
 *
 * @example
 * type A = InferPartial<F32> // => number | undefined
 * type B = InferPartial<WgslStruct<{ a: F32 }>> // => { a?: number | undefined }
 * type C = InferPartial<WgslArray<F32>> // => { a?: number | undefined }
 */
export type InferPartial<T> = T extends { readonly '~reprPartial': infer TRepr }
  ? TRepr
  : T extends { readonly [$repr]: infer TRepr }
    ? TRepr | undefined
    : T;

/**
 * Extracts the inferred representation of a resource (as seen by the GPU).
 *
 * @example
 * type A = InferGPU<F32> // => number
 * type B = InferGPU<WgslArray<F32>> // => number[]
 * type C = Infer<Atomic<U32>> // => atomicU32
 */
export type InferGPU<T> = T extends { readonly '~gpuRepr': infer TRepr }
  ? TRepr
  : Infer<T>;

export type InferRecord<T extends Record<string | number | symbol, unknown>> = {
  [Key in keyof T]: Infer<T[Key]>;
};

export type InferPartialRecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]?: InferPartial<T[Key]>;
};

export type InferGPURecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]: InferGPU<T[Key]>;
};

export type MemIdentity<T> = T extends {
  readonly '~memIdent': infer TMemIdent;
}
  ? TMemIdent
  : T;

export type MemIdentityRecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]: MemIdentity<T[Key]>;
};

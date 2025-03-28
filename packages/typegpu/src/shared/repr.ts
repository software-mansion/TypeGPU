export const $repr = Symbol(
  'Type token for the inferred (CPU & GPU) representation of a resource',
);

export const $gpuRepr = Symbol(
  'Type token for the inferred (GPU) representation of a resource',
);

export const $partialRepr = Symbol(
  'Type token for the inferred partial representation of a resource',
);

export const $memIdentity = Symbol(
  'Type token for union of all compatible data-types on the byte level',
);

/**
 * Extracts the inferred representation of a resource.
 * @example
 * type A = Infer<F32> // => number
 * type B = Infer<WgslArray<F32>> // => number[]
 */
export type Infer<T> = T extends { readonly [$repr]: infer TRepr } ? TRepr : T;
export type InferPartial<T> = T extends { readonly [$partialRepr]: infer TRepr }
  ? TRepr
  : T extends { readonly '~reprPartial': infer TRepr }
    ? TRepr
    : T extends { readonly [$repr]: infer TRepr }
      ? TRepr | undefined
      : T extends Record<string | number | symbol, unknown>
        ? InferPartialRecord<T>
        : T;

export type InferGPU<T> = T extends { readonly [$gpuRepr]: infer TRepr }
  ? TRepr
  : T extends { readonly '~gpuRepr': infer TRepr }
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
  readonly [$memIdentity]: infer TMemIdent;
}
  ? TMemIdent
  : T extends {
        readonly '~memIdent': infer TMemIdent;
      }
    ? TMemIdent
    : T;

export type MemIdentityRecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]: MemIdentity<T[Key]>;
};

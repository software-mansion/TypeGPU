import type { Disarray, Undecorate } from '../data/dataTypes.ts';
import type { U16, U32, WgslArray } from '../data/wgslTypes.ts';
import type {
  $gpuRepr,
  $gpuValueOf,
  $invalidSchemaReason,
  $memIdent,
  $repr,
  $reprPartial,
  $validStorageSchema,
  $validUniformSchema,
  $validVertexSchema,
} from './symbols.ts';

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
 * type C = InferPartial<WgslArray<F32>> // => { idx: number; value: number | undefined }[] | undefined
 */
export type InferPartial<T> = T extends { readonly [$reprPartial]: infer TRepr }
  ? TRepr
  : T extends { readonly [$repr]: infer TRepr } ? TRepr | undefined
  : T;

/**
 * Extracts the inferred representation of a resource (as seen by the GPU).
 *
 * @example
 * type A = InferGPU<F32> // => number
 * type B = InferGPU<WgslArray<F32>> // => number[]
 * type C = InferGPU<Atomic<U32>> // => atomicU32
 */
export type InferGPU<T> = T extends { readonly [$gpuRepr]: infer TRepr } ? TRepr
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

export type GPUValueOf<T> = T extends
  { [$gpuValueOf](...args: never[]): infer TValue } ? TValue : T;

export type MemIdentity<T> = T extends { readonly [$memIdent]: infer TMemIdent }
  ? TMemIdent
  : T;

export type MemIdentityRecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]: MemIdentity<T[Key]>;
};

export type IsValidStorageSchema<T> =
  (T extends { readonly [$validStorageSchema]: true } ? true : false) extends //
  // The check above can eval to `boolean` if parts of the union
  // are valid, but some aren't. We only treat schemas invalid if all
  // union elements are invalid.
  false ? false
    : true;

export type IsValidUniformSchema<T> =
  (T extends { readonly [$validUniformSchema]: true } ? true : false) extends //
  // The check above can eval to `boolean` if parts of the union
  // are valid, but some aren't. We only treat schemas invalid if all
  // union elements are invalid.
  false ? false
    : true;

export type IsValidVertexSchema<T> =
  (T extends { readonly [$validVertexSchema]: true } ? true : false) extends //
  // The check above can eval to `boolean` if parts of the union
  // are valid, but some aren't. We only treat schemas invalid if all
  // union elements are invalid.
  false ? false
    : true;

/**
 * Accepts only arrays (or disarrays) of u32 or u16.
 */
export type IsValidIndexSchema<T> = Undecorate<T> extends WgslArray | Disarray
  ? (Undecorate<Undecorate<T>['elementType']>) extends U32 | U16 ? true : false
  : false;

/**
 * Checks if a schema can be used in a buffer at all
 */
export type IsValidBufferSchema<T> = (
  | IsValidStorageSchema<T>
  | IsValidUniformSchema<T>
  | IsValidVertexSchema<T>
  | IsValidIndexSchema<T>
) extends false ? false : true;

export type ExtractInvalidSchemaError<T, TPrefix extends string = ''> =
  [T] extends [{ readonly [$invalidSchemaReason]: string }]
    ? `${TPrefix}${T[typeof $invalidSchemaReason]}`
    : never;

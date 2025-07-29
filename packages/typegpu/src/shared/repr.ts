import type { U16, WgslArray } from '../data/wgslTypes.ts';
import type {
  $gpuRepr,
  $invalidIndexSchema,
  $invalidStorageSchema,
  $invalidUniformSchema,
  $invalidVertexSchema,
  $memIdent,
  $repr,
  $reprPartial,
  $validUniformSchema,
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

export type MemIdentity<T> = T extends { readonly [$memIdent]: infer TMemIdent }
  ? TMemIdent
  : T;

export type MemIdentityRecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]: MemIdentity<T[Key]>;
};

export type IsInvalidStorageSchema<T> = [T] extends
  [{ readonly [$invalidStorageSchema]: string }] ? true : false;

export type IsInvalidUniformSchema<T> = [T] extends
  [{ readonly [$validUniformSchema]: true }] ? false
  : [T] extends [{ readonly [$invalidUniformSchema]: string }] ? true
  : false;

export type IsInvalidVertexSchema<T> = [T] extends
  [{ readonly [$invalidVertexSchema]: string }] ? true : false;

/**
 * TODO: Index schemas can (probably) just be either array<u16> or array<u32>, but best verify with Konrad
 */
export type IsInvalidIndexSchema<T> = [T] extends [WgslArray<U16>] ? false
  : [T] extends [{ readonly [$invalidIndexSchema]: string }] ? true
  : false;

/**
 * Checks if a schema cannot be used in any type of buffer
 */
export type IsInvalidBufferSchema<T> = [
  (
    & IsInvalidStorageSchema<T>
    & IsInvalidUniformSchema<T>
    & IsInvalidVertexSchema<T>
    & IsInvalidIndexSchema<T>
  ),
] extends [false] ? false : true;

export type ExtractInvalidStorageSchemaError<T, TPrefix extends string = ''> =
  [T] extends [{ readonly [$invalidStorageSchema]: string }]
    ? `${TPrefix}${T[typeof $invalidStorageSchema]}`
    : never;

export type ExtractInvalidUniformSchemaError<T, TPrefix extends string = ''> =
  [T] extends [{ readonly [$invalidUniformSchema]: string }]
    ? `${TPrefix}${T[typeof $invalidUniformSchema]}`
    : never;

export type ExtractInvalidVertexSchemaError<T, TPrefix extends string = ''> =
  [T] extends [{ readonly [$invalidVertexSchema]: string }]
    ? `${TPrefix}${T[typeof $invalidVertexSchema]}`
    : never;

export type ExtractInvalidIndexSchemaError<T, TPrefix extends string = ''> =
  [T] extends [{ readonly [$invalidIndexSchema]: string }]
    ? `${TPrefix}${T[typeof $invalidIndexSchema]}`
    : never;

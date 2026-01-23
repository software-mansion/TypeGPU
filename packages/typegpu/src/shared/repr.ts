import type { TgpuTexture } from '../core/texture/texture.ts';
import type { WgslStorageTexture, WgslTexture } from '../data/texture.ts';
import type {
  $gpuRepr,
  $gpuValueOf,
  $invalidIndexSchema,
  $invalidStorageSchema,
  $invalidUniformSchema,
  $invalidVertexSchema,
  $memIdent,
  $repr,
  $reprPartial,
} from './symbols.ts';
import type { ViewDimensionToDimension } from '../core/texture/textureFormats.ts';
import type { Default } from './utilityTypes.ts';

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

export type GPUValueOf<T> = T extends { readonly [$gpuValueOf]: infer TValue }
  ? TValue
  : T;

export type MemIdentity<T> = T extends { readonly [$memIdent]: infer TMemIdent }
  ? TMemIdent
  : T;

export type MemIdentityRecord<
  T extends Record<string | number | symbol, unknown>,
> = {
  [Key in keyof T]: MemIdentity<T[Key]>;
};

/**
 * Validates if a texture can be used as sampled texture
 */
export type IsValidSampledTextureUsage<TTexture extends TgpuTexture> =
  TTexture['usableAsSampled'] extends true ? true
    : {
      readonly invalidSampled:
        "Texture not usable as sampled, call $usage('sampled') first";
    };

/**
 * Validates if a texture can be used as storage texture
 */
export type IsValidStorageTextureUsage<TTexture extends TgpuTexture> =
  TTexture['usableAsStorage'] extends true ? true
    : {
      readonly invalidStorage:
        "Texture not usable as storage, call $usage('storage') first";
    };

/**
 * Validates if a texture view dimension is compatible with the texture dimension
 */
export type IsValidSubdimension<
  TTexture extends TgpuTexture,
  TSchema extends WgslTexture | WgslStorageTexture,
> = ViewDimensionToDimension[
  TSchema['dimension']
] extends infer TVDim
  ? TVDim extends Default<TTexture['props']['dimension'], '2d'> ? true
  : {
    readonly invalidViewDim: `Texture dimension '${Default<
      TTexture['props']['dimension'],
      '2d'
    >}' incompatible with view dimension '${TSchema['dimension']}'`;
  }
  : never;

export type IsValidStorageFormat<
  TTexture extends TgpuTexture,
  TSchema extends WgslStorageTexture,
> = TSchema['format'] extends TTexture['props']['format'] ? true
  : TTexture['props']['viewFormats'] extends readonly unknown[]
    ? TSchema['format'] extends TTexture['props']['viewFormats'][number] ? true
    : FormatError<TSchema, TTexture>
  : FormatError<TSchema, TTexture>;

type FormatError<
  TSchema extends WgslStorageTexture,
  TTexture extends TgpuTexture,
> = {
  readonly invalidFormat: `Storage texture format '${TSchema[
    'format'
  ]}' incompatible with texture format '${TTexture['props'][
    'format'
  ]}'`;
};

type IsExactly<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false)
  : false;
type SelfOrErrors<TSelf, T> = IsExactly<T, true> extends true ? TSelf
  : `(Error) ${T[Extract<keyof T, `invalid${string}`>] & string}`;

export type ValidStorageUsage<
  TTexture extends TgpuTexture,
  TSchema extends WgslStorageTexture,
> =
  & IsValidStorageTextureUsage<TTexture>
  & IsValidSubdimension<TTexture, TSchema>
  & IsValidStorageFormat<TTexture, TSchema>;

export type ValidSampledUsage<
  TTexture extends TgpuTexture,
  TSchema extends WgslTexture,
> =
  & IsValidSampledTextureUsage<TTexture>
  & IsValidSubdimension<TTexture, TSchema>;

/**
 * Validates texture view schema against texture usage
 */
export type ValidateTextureViewSchema<
  TTexture extends TgpuTexture,
  TSchema extends WgslTexture | WgslStorageTexture,
> = TSchema extends WgslStorageTexture
  ? SelfOrErrors<TSchema, ValidStorageUsage<TTexture, TSchema>>
  : TSchema extends WgslTexture
    ? SelfOrErrors<TSchema, ValidSampledUsage<TTexture, TSchema>>
  : never;

export type ExtractInvalidStorageError<T, TPrefix extends string = ''> =
  [T] extends [{ readonly [$invalidStorageSchema]: string }]
    ? `${TPrefix}${T[typeof $invalidStorageSchema]}`
    : never;

export type ExtractInvalidUniformError<T, TPrefix extends string = ''> =
  [T] extends [{ readonly [$invalidUniformSchema]: string }]
    ? `${TPrefix}${T[typeof $invalidUniformSchema]}`
    : never;

export type ExtractInvalidVertexError<T, TPrefix extends string = ''> =
  [T] extends [{ readonly [$invalidVertexSchema]: string }]
    ? `${TPrefix}${T[typeof $invalidVertexSchema]}`
    : never;

export type ExtractInvalidIndexError<T, TPrefix extends string = ''> =
  [T] extends [{ readonly [$invalidIndexSchema]: string }]
    ? `${TPrefix}${T[typeof $invalidIndexSchema]}`
    : never;

export type ExtractInvalidSchemaError<T, TPrefix extends string = ''> =
  | ExtractInvalidStorageError<T, TPrefix>
  | ExtractInvalidUniformError<T, TPrefix>
  | ExtractInvalidVertexError<T, TPrefix>
  | ExtractInvalidIndexError<T, TPrefix>;

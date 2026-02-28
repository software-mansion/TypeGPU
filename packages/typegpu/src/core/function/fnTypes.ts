import type * as tinyest from 'tinyest';
import type { BuiltinClipDistances } from '../../builtin.ts';
import type { AnyAttribute } from '../../data/attributes.ts';
import type {
  Bool,
  Decorated,
  F16,
  F32,
  I32,
  U32,
  Vec2f,
  Vec2h,
  Vec2i,
  Vec2u,
  Vec3f,
  Vec3h,
  Vec3i,
  Vec3u,
  Vec4f,
  Vec4h,
  Vec4i,
  Vec4u,
  Void,
} from '../../data/wgslTypes.ts';
import type { Infer } from '../../shared/repr.ts';

export type AnyFn = (...args: never[]) => unknown;

/**
 * Information extracted from transpiling a JS function.
 */
export type TranspilationResult = {
  params: tinyest.FuncParameter[];
  body: tinyest.Block;
  /**
   * All identifiers found in the function code that are not declared in the
   * function itself, or in the block that is accessing that identifier.
   */
  externalNames: string[];
};

export type InferArgs<T extends unknown[]> = {
  [Idx in keyof T]: Infer<T[Idx]>;
};

type InheritTupleValues<T, From> = {
  [K in keyof T]: K extends keyof From ? From[K] : never;
};

/**
 * Returns a type that has arg and return types of `T`, but argument
 * names of `From`
 *
 * Wrapped in an object type with `result` prop just so that it's easier
 * to remove InheritArgNames<...> from Intellisense with Prettify<T>['result']
 */
export type InheritArgNames<T extends AnyFn, From extends AnyFn> = {
  result: (
    ...args: Parameters<
      ((...args: InheritTupleValues<Parameters<From>, Parameters<T>>) => ReturnType<T>) & T
    >
  ) => ReturnType<T>;
};

export type InferImplSchema<ImplSchema extends AnyFn> = (
  ...args: InferArgs<Parameters<ImplSchema>>
) => Infer<ReturnType<ImplSchema>>;

export type Implementation<ImplSchema extends AnyFn = AnyFn> = string | InferImplSchema<ImplSchema>;

export type BaseIOData =
  | Bool
  | F32
  | F16
  | I32
  | U32
  | Vec2f
  | Vec3f
  | Vec4f
  | Vec2h
  | Vec3h
  | Vec4h
  | Vec2i
  | Vec3i
  | Vec4i
  | Vec2u
  | Vec3u
  | Vec4u;

export type IOData = BaseIOData | Decorated<BaseIOData, AnyAttribute[]> | BuiltinClipDistances;

export type IORecord<TElementType extends IOData = IOData> = Record<string, TElementType>;

/**
 * Used for I/O definitions of entry functions.
 */
export type IOLayout<TElementType extends IOData = IOData> =
  | TElementType
  | IORecord<TElementType>
  | Void;

export type InferIO<T> = T extends { type: string }
  ? Infer<T>
  : T extends Record<string, unknown>
    ? { [K in keyof T]: Infer<T[K]> }
    : T;

import type * as tinyest from 'tinyest';
import type { BuiltinClipDistances } from '../../builtin.ts';
import type { AnyAttribute } from '../../data/attributes.ts';
import type {
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

export type JsImplementation<
  Args extends unknown[] | [] = unknown[] | [],
  Return = unknown,
> = (...args: InferArgs<Args>) => Infer<Return>;

export type Implementation<
  Args extends unknown[] | [] = unknown[] | [],
  Return = unknown,
> = string | JsImplementation<Args, Return>;

export type BaseIOData =
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

export type IOData =
  | BaseIOData
  | Decorated<BaseIOData, AnyAttribute[]>
  | BuiltinClipDistances;

export type IORecord<TElementType extends IOData = IOData> = Record<
  string,
  TElementType
>;

/**
 * Used for I/O definitions of entry functions.
 */
export type IOLayout<TElementType extends IOData = IOData> =
  | TElementType
  | IORecord<TElementType>
  | Void;

export type InferIO<T> = T extends { type: string } ? Infer<T>
  : T extends Record<string, unknown> ? { [K in keyof T]: Infer<T[K]> }
  : T;

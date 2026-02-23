import { setName, type TgpuNamable } from '../shared/meta.ts';
import { isMarkedInternal } from '../shared/symbols.ts';
import type {
  Infer,
  InferGPURecord,
  InferPartial,
  InferPartialRecord,
  InferRecord,
  IsValidVertexSchema,
  MemIdentityRecord,
} from '../shared/repr.ts';
import type {
  $gpuRepr,
  $invalidSchemaReason,
  $memIdent,
  $repr,
  $reprPartial,
  $validVertexSchema,
} from '../shared/symbols.ts';
import { $internal } from '../shared/symbols.ts';
import type { Prettify } from '../shared/utilityTypes.ts';
import { vertexFormats } from '../shared/vertexFormat.ts';
import type {
  WgslExternalTexture,
  WgslStorageTexture,
  WgslTexture,
} from './texture.ts';
import type { Snippet } from './snippet.ts';
import type { PackedData } from './vertexFormatData.ts';
import * as wgsl from './wgslTypes.ts';
import type { WgslComparisonSampler, WgslSampler } from './sampler.ts';
import type { ResolutionCtx } from '../types.ts';
import type { BaseData } from './wgslTypes.ts';

/**
 * Array schema constructed via `d.disarrayOf` function.
 *
 * Useful for defining vertex buffers.
 * Elements in the schema are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface Disarray<out TElement extends wgsl.BaseData = wgsl.BaseData>
  extends wgsl.BaseData {
  <T extends TElement>(elements: Infer<T>[]): Infer<T>[];
  (): Infer<TElement>[];
  readonly type: 'disarray';
  readonly elementCount: number;
  readonly elementType: TElement;

  // Type-tokens, not available at runtime
  readonly [$repr]: Infer<TElement>[];
  readonly [$reprPartial]:
    | { idx: number; value: InferPartial<TElement> }[]
    | undefined;
  readonly [$validVertexSchema]: IsValidVertexSchema<TElement>;
  readonly [$invalidSchemaReason]:
    'Disarrays are not host-shareable, use arrays instead';
  // ---
}

/**
 * Struct schema constructed via `d.unstruct` function.
 *
 * Useful for defining vertex buffers, as the standard layout restrictions do not apply.
 * Members are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface Unstruct<
  // @ts-expect-error: Override variance, as we want unstructs to behave like objects
  out TProps extends Record<string, wgsl.BaseData> = Record<
    string,
    wgsl.BaseData
  >,
> extends wgsl.BaseData, TgpuNamable {
  (props: Prettify<InferRecord<TProps>>): Prettify<InferRecord<TProps>>;
  (): Prettify<InferRecord<TProps>>;
  readonly type: 'unstruct';
  readonly propTypes: TProps;

  // Type-tokens, not available at runtime
  readonly [$repr]: Prettify<InferRecord<TProps>>;
  readonly [$gpuRepr]: Prettify<InferGPURecord<TProps>>;
  readonly [$memIdent]: Unstruct<Prettify<MemIdentityRecord<TProps>>>;
  readonly [$reprPartial]:
    | Prettify<Partial<InferPartialRecord<TProps>>>
    | undefined;
  readonly [$validVertexSchema]: {
    [K in keyof TProps]: IsValidVertexSchema<TProps[K]>;
  }[keyof TProps] extends true ? true : false;
  readonly [$invalidSchemaReason]:
    'Unstructs are not host-shareable, use structs instead';
  // ---
}

/** @deprecated Just use `Unstruct` without any type parameters */
export type AnyUnstruct = Unstruct;

export interface LooseDecorated<
  out TInner extends wgsl.BaseData = wgsl.BaseData,
  out TAttribs extends unknown[] = unknown[],
> extends wgsl.BaseData {
  readonly type: 'loose-decorated';
  readonly inner: TInner;
  readonly attribs: TAttribs;

  // Type-tokens, not available at runtime
  readonly [$repr]: Infer<TInner>;
  readonly [$invalidSchemaReason]:
    'Loosely decorated schemas are not host-shareable';
  readonly [$validVertexSchema]: IsValidVertexSchema<TInner>;
  // ---
}

/**
 * Type utility to extract the inner type from decorated types.
 */
export type Undecorate<T> = T extends {
  readonly type: 'decorated' | 'loose-decorated';
  readonly inner: infer TInner;
} ? TInner
  : T;

/**
 * Type utility to undecorate all values in a record.
 */
export type UndecorateRecord<T extends Record<string, unknown>> = {
  [Key in keyof T]: Undecorate<T[Key]>;
};

/**
 * Runtime function to extract the inner data type from decorated types.
 * If the data is not decorated, returns the data as-is.
 */
export function undecorate(data: BaseData): BaseData {
  if (wgsl.isDecorated(data) || isLooseDecorated(data)) {
    return data.inner;
  }
  return data;
}

export function unptr(data: BaseData | UnknownData): BaseData | UnknownData {
  if (wgsl.isPtr(data)) {
    return data.inner;
  }
  return data;
}

const looseTypeLiterals = [
  'unstruct',
  'disarray',
  'loose-decorated',
  ...vertexFormats,
] as const;

export type LooseTypeLiteral = (typeof looseTypeLiterals)[number];
export type IsLooseData<T> = T extends { readonly type: LooseTypeLiteral }
  ? true
  : false;

export type AnyLooseData = Disarray | Unstruct | LooseDecorated | PackedData;

export function isLooseData(data: unknown): data is AnyLooseData {
  return (
    isMarkedInternal(data) &&
    looseTypeLiterals.includes((data as AnyLooseData)?.type)
  );
}

/**
 * Checks whether the passed in value is a disarray schema,
 * as opposed to, e.g., a regular array schema.
 *
 * Array schemas can be used to describe uniform and storage buffers,
 * whereas disarray schemas cannot. Disarrays are useful for
 * defining vertex buffers instead.
 *
 * @example
 * isDisarray(d.arrayOf(d.u32, 4)) // false
 * isDisarray(d.disarrayOf(d.u32, 4)) // true
 * isDisarray(d.vec3f) // false
 */
export function isDisarray(schema: unknown): schema is Disarray {
  return isMarkedInternal(schema) && (schema as Disarray)?.type === 'disarray';
}

/**
 * Checks whether passed in value is a unstruct schema,
 * as opposed to, e.g., a struct schema.
 *
 * Struct schemas can be used to describe uniform and storage buffers,
 * whereas unstruct schemas cannot. Unstructs are useful for
 * defining vertex buffers instead.
 *
 * @example
 * isUnstruct(d.struct({ a: d.u32 })) // false
 * isUnstruct(d.unstruct({ a: d.u32 })) // true
 * isUnstruct(d.vec3f) // false
 */
export function isUnstruct(schema: unknown): schema is Unstruct {
  return isMarkedInternal(schema) && (schema as Unstruct)?.type === 'unstruct';
}

export function isLooseDecorated(
  value: unknown,
): value is LooseDecorated {
  return isMarkedInternal(value) &&
    (value as LooseDecorated)?.type === 'loose-decorated';
}

export function getCustomAlignment(data: wgsl.BaseData): number | undefined {
  return (data as unknown as wgsl.Decorated | LooseDecorated).attribs?.find(
    wgsl.isAlignAttrib,
  )?.params[0];
}

export function getCustomSize(data: wgsl.BaseData): number | undefined {
  return (data as unknown as wgsl.Decorated | LooseDecorated).attribs?.find(
    wgsl.isSizeAttrib,
  )?.params[0];
}

export function getCustomLocation(data: wgsl.BaseData): number | undefined {
  return (data as unknown as wgsl.Decorated | LooseDecorated).attribs?.find(
    wgsl.isLocationAttrib,
  )?.params[0];
}

export function isData(value: unknown): value is AnyData {
  return wgsl.isWgslData(value) || isLooseData(value);
}

export type AnyData = wgsl.AnyWgslData | AnyLooseData;
export type AnyConcreteData = Exclude<
  AnyData,
  | wgsl.AbstractInt
  | wgsl.AbstractFloat
  | wgsl.Void
  | WgslTexture
  | WgslStorageTexture
  | WgslExternalTexture
  | WgslSampler
  | WgslComparisonSampler
>;

export const UnknownData = Symbol('UNKNOWN');
export type UnknownData = typeof UnknownData;

export class InfixDispatch {
  constructor(
    readonly name: string,
    readonly lhs: Snippet,
    readonly operator: (
      ctx: ResolutionCtx,
      args: [lhs: Snippet, rhs: Snippet],
    ) => Snippet,
  ) {}
}

export class MatrixColumnsAccess {
  constructor(
    readonly matrix: Snippet,
  ) {}
}

export class ConsoleLog {
  [$internal] = true;
  constructor(readonly op: string) {
    setName(this, 'consoleLog');
  }
}

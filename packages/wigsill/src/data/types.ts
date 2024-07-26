import type { ISchema } from 'typed-binary';
import type { WgslResolvable } from '../types';

export interface WgslData<TInner> extends ISchema<TInner>, WgslResolvable {
  readonly byteAlignment: number;
  readonly size: number;
}

export type AnyWgslData = WgslData<unknown>;

export interface WgslPointer<
  TScope extends 'function',
  TInner extends AnyWgslData,
> {
  readonly scope: TScope;
  readonly pointsTo: TInner;
}

/**
 * A virtual representation of a WGSL value.
 */
export type WgslValue<TDataType> = {
  readonly __dataType: TDataType;
};

export type AnyWgslPointer = WgslPointer<'function', AnyWgslData>;

export type WgslFnArgument = AnyWgslPointer | AnyWgslData;

export function isPointer(
  value: AnyWgslPointer | AnyWgslData,
): value is AnyWgslPointer {
  return 'pointsTo' in value;
}

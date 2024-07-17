import type { ISchema } from 'typed-binary';
import type { WgslResolvable } from '../types';

export interface WgslData<TInner> extends ISchema<TInner>, WgslResolvable {
  readonly byteAlignment: number;
  readonly size: number;
}

export type AnyWgslData = WgslData<unknown>;

export interface WGSLPointerType<
  TScope extends 'function',
  TInner extends AnyWgslData,
> {
  readonly scope: TScope;
  readonly pointsTo: TInner;
}

/**
 * A virtual representation of a WGSL value.
 */
export type WGSLValue<TDataType> = {
  readonly __dataType: TDataType;
};

export type AnyWGSLPointerType = WGSLPointerType<'function', AnyWgslData>;

export type WGSLFnArgument = AnyWGSLPointerType | AnyWgslData;

export function isPointer(
  value: AnyWGSLPointerType | AnyWgslData,
): value is AnyWGSLPointerType {
  return 'pointsTo' in value;
}

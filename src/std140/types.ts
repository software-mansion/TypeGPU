import { ISchema } from 'typed-binary';
import type { WGSLItem } from '../types';

export interface WGSLDataType<TInner> extends ISchema<TInner>, WGSLItem {
  readonly baseAlignment: number;
  readonly size: number;
}

export type AnyWGSLDataType = WGSLDataType<unknown>;

export interface WGSLPointerType<
  TScope extends 'function',
  TInner extends AnyWGSLDataType,
> {
  readonly scope: TScope;
  readonly dataType: TInner;
}

/**
 * A virtual representation of a WGSL value.
 */
export type WGSLValue<TDataType> = {
  readonly __dataType: TDataType;
};

export type AnyWGSLPointerType = WGSLPointerType<'function', AnyWGSLDataType>;

export type WGSLFnArgument = AnyWGSLPointerType | AnyWGSLDataType;

export function isPointer(
  value: AnyWGSLPointerType | AnyWGSLDataType,
): value is AnyWGSLPointerType {
  return 'dataType' in value;
}

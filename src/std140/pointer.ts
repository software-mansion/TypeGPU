import { AnyWGSLDataType, WGSLPointerType } from './types';

export function ptr<TDataType extends AnyWGSLDataType>(
  dataType: TDataType,
): WGSLPointerType<'function', TDataType> {
  return {
    scope: 'function',
    dataType,
  };
}

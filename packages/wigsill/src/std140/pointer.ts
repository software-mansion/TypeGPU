import { AnyWGSLDataType, WGSLPointerType } from './types';

export function ptr<TDataType extends AnyWGSLDataType>(
  pointsTo: TDataType,
): WGSLPointerType<'function', TDataType> {
  return {
    scope: 'function',
    pointsTo,
  };
}

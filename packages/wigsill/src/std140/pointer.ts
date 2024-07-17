import type { AnyWgslData, WGSLPointerType } from './types';

export function ptr<TDataType extends AnyWgslData>(
  pointsTo: TDataType,
): WGSLPointerType<'function', TDataType> {
  return {
    scope: 'function',
    pointsTo,
  };
}

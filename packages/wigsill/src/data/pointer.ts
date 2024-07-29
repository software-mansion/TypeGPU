import type { AnyWgslData, WgslPointer } from '../types';

export function ptr<TDataType extends AnyWgslData>(
  pointsTo: TDataType,
): WgslPointer<'function', TDataType> {
  return {
    scope: 'function',
    pointsTo,
  };
}

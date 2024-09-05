import type { AnyTgpuData, TgpuPointer } from '../types';

export function ptr<TDataType extends AnyTgpuData>(
  pointsTo: TDataType,
): TgpuPointer<'function', TDataType> {
  return {
    scope: 'function',
    pointsTo,
  };
}

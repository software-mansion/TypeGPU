import type { AnyData } from './dataTypes.ts';
import type { BaseData } from './wgslTypes.ts';
import { getLayoutInfo } from './schemaMemoryLayout.ts';

export function isContiguous(schema: BaseData): boolean {
  return getLayoutInfo(schema, 'isContiguous');
}

/**
 * Returns `true` if data represented by the `schema` doesn't have padding.
 */
export function PUBLIC_isContiguous(schema: AnyData): boolean {
  return isContiguous(schema);
}

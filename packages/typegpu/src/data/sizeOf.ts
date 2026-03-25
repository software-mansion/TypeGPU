import type { AnyData } from './dataTypes.ts';
import type { BaseData } from './wgslTypes.ts';
import { getLayoutInfo } from './schemaMemoryLayout.ts';

export function sizeOf(schema: BaseData): number {
  return getLayoutInfo(schema, 'size');
}

/**
 * Returns the size (in bytes) of data represented by the `schema`.
 */
export function PUBLIC_sizeOf(schema: AnyData): number {
  return sizeOf(schema);
}

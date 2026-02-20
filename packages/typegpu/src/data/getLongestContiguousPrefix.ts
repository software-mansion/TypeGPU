import type { AnyData } from './dataTypes.ts';
import type { BaseData } from './wgslTypes.ts';
import { getLayoutInfo } from './schemaMemoryLayout.ts';

export function getLongestContiguousPrefix(schema: BaseData): number {
  return getLayoutInfo(schema, 'longestContiguousPrefix');
}

/**
 * Returns the size (in bytes) of the longest contiguous memory prefix of data represented by the `schema`.
 */
export function PUBLIC_getLongestContiguousPrefix(schema: AnyData): number {
  return getLongestContiguousPrefix(schema);
}

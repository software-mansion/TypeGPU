import { comptime } from '../core/function/comptime.ts';
import { type AnyData, undecorate } from './dataTypes.ts';
import type { BaseData } from './wgslTypes.ts';
import { getLayoutInfo } from './schemaMemoryLayout.ts';

export function sizeOf(schema: BaseData): number {
  return getLayoutInfo(schema, 'size');
}

/**
 * Returns the size (in bytes) of data represented by the `schema`.
 */
export const PUBLIC_sizeOf = comptime((schema: AnyData): number =>
  // `@size` applies only to struct (and unstruct) members, so a decorated schema
  // on its own takes up as much space as the type it wraps.
  sizeOf(undecorate(schema)),
);

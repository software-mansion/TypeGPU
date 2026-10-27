import { roundUp } from '../mathUtils.ts';
import { alignmentOf, customAlignmentOf } from './alignmentOf.ts';
import { isUnstruct, type Unstruct } from './dataTypes.ts';
import { sizeOf } from './sizeOf.ts';
import type { WgslStruct } from './wgslTypes.ts';

export interface OffsetInfo {
  offset: number;
  size: number;
  padding?: number | undefined;
}

const cachedOffsets = new WeakMap<WgslStruct | Unstruct, Record<string, OffsetInfo>>();

export function offsetsForProps<T extends WgslStruct | Unstruct>(
  struct: T,
): Record<keyof T['propTypes'], OffsetInfo> {
  type Key = keyof T['propTypes'];

  const cached = cachedOffsets.get(struct);
  if (cached) {
    return cached as Record<Key, OffsetInfo>;
  }

  let size = 0;
  const offsets = {} as Record<Key, OffsetInfo>;
  let lastEntry: OffsetInfo | undefined;

  for (const key in struct.propTypes) {
    const prop = struct.propTypes[key];
    if (prop === undefined) {
      throw new Error(`Property ${key} is undefined in struct`);
    }

    const beforeAlignment = size;

    size = roundUp(size, isUnstruct(struct) ? customAlignmentOf(prop) : alignmentOf(prop));

    if (lastEntry) {
      lastEntry.padding = size - beforeAlignment;
    }

    const propSize = sizeOf(prop);
    offsets[key as Key] = { offset: size, size: propSize };
    lastEntry = offsets[key];
    size += propSize;
  }

  if (lastEntry) {
    lastEntry.padding = roundUp(sizeOf(struct), alignmentOf(struct)) - size;
  }

  cachedOffsets.set(struct, offsets);
  return offsets;
}

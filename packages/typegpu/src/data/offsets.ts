import { Measurer } from 'typed-binary';
import { roundUp } from '../mathUtils.ts';
import alignIO from './alignIO.ts';
import { alignmentOf, customAlignmentOf } from './alignmentOf.ts';
import { isUnstruct, type Unstruct } from './dataTypes.ts';
import { sizeOf } from './sizeOf.ts';
import type { WgslStruct } from './wgslTypes.ts';

export interface OffsetInfo {
  offset: number;
  size: number;
  padding?: number | undefined;
}

const cachedOffsets = new WeakMap<
  WgslStruct | Unstruct,
  Record<string, OffsetInfo>
>();

export function offsetsForProps<T extends WgslStruct | Unstruct>(
  struct: T,
): Record<keyof T['propTypes'], OffsetInfo> {
  type Key = keyof T['propTypes'];

  const cached = cachedOffsets.get(struct);
  if (cached) {
    return cached as Record<Key, OffsetInfo>;
  }

  const measurer = new Measurer();
  const offsets = {} as Record<Key, OffsetInfo>;
  let lastEntry: OffsetInfo | undefined;

  for (const key in struct.propTypes) {
    const prop = struct.propTypes[key];
    if (prop === undefined) {
      throw new Error(`Property ${key} is undefined in struct`);
    }

    const beforeAlignment = measurer.size;

    alignIO(
      measurer,
      isUnstruct(struct) ? customAlignmentOf(prop) : alignmentOf(prop),
    );

    if (lastEntry) {
      lastEntry.padding = measurer.size - beforeAlignment;
    }

    const propSize = sizeOf(prop);
    offsets[key as Key] = { offset: measurer.size, size: propSize };
    lastEntry = offsets[key];
    measurer.add(propSize);
  }

  if (lastEntry) {
    lastEntry.padding = roundUp(sizeOf(struct), alignmentOf(struct)) -
      measurer.size;
  }

  cachedOffsets.set(struct, offsets);
  return offsets;
}

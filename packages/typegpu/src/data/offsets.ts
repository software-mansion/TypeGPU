import { Measurer } from 'typed-binary';
import { roundUp } from '../mathUtils';
import alignIO from './alignIO';
import { alignmentOf, customAlignmentOf } from './alignmentOf';
import { type Unstruct, isUnstruct } from './dataTypes';
import { sizeOf } from './sizeOf';
import type { AnyWgslStruct, WgslStruct } from './struct';
import type { BaseData } from './wgslTypes';

export interface OffsetInfo {
  offset: number;
  size: number;
  padding?: number | undefined;
}

const cachedOffsets = new WeakMap<
  AnyWgslStruct | Unstruct,
  Record<string, OffsetInfo>
>();

export function offsetsForProps<T extends Record<string, BaseData>>(
  struct: WgslStruct<T> | Unstruct<T>,
): Record<keyof T, OffsetInfo> {
  const cached = cachedOffsets.get(struct);
  if (cached) {
    return cached as Record<keyof T, OffsetInfo>;
  }

  const measurer = new Measurer();
  const offsets = {} as Record<keyof T, OffsetInfo>;
  let lastEntry: OffsetInfo | undefined = undefined;

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
    offsets[key] = { offset: measurer.size, size: propSize };
    lastEntry = offsets[key];
    measurer.add(propSize);
  }

  if (lastEntry) {
    lastEntry.padding =
      roundUp(sizeOf(struct), alignmentOf(struct)) - measurer.size;
  }

  cachedOffsets.set(
    struct as
      | WgslStruct<Record<string, BaseData>>
      | Unstruct<Record<string, BaseData>>,
    offsets,
  );

  return offsets;
}

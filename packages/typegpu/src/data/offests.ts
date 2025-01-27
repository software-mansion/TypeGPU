import { Measurer } from 'typed-binary';
import alignIO from './alignIO';
import { alignmentOf, customAlignmentOf } from './alignmentOf';
import { type Unstruct, isUnstruct } from './dataTypes';
import { sizeOf } from './sizeOf';
import type { BaseWgslData, WgslStruct } from './wgslTypes';

const cachedOffsets = new WeakMap<
  WgslStruct | Unstruct,
  Record<string, number>
>();

export function offsetsForProps<T extends Record<string, BaseWgslData>>(
  struct: WgslStruct<T> | Unstruct<T>,
): Record<keyof T, number> {
  const cached = cachedOffsets.get(
    struct as WgslStruct<Record<string, BaseWgslData>>,
  );
  if (cached) {
    return cached as Record<keyof T, number>;
  }

  const measurer = new Measurer();
  const offsets: Record<keyof T, number> = {} as Record<keyof T, number>;
  for (const key in struct.propTypes) {
    const prop = struct.propTypes[key];
    if (prop === undefined) {
      throw new Error(`Property ${key} is undefined in struct`);
    }

    if (isUnstruct(struct)) {
      alignIO(measurer, customAlignmentOf(prop));
    } else {
      alignIO(measurer, alignmentOf(prop));
    }
    offsets[key] = measurer.size;
    measurer.add(sizeOf(prop));
  }

  cachedOffsets.set(
    struct as
      | WgslStruct<Record<string, BaseWgslData>>
      | Unstruct<Record<string, BaseWgslData>>,
    offsets,
  );
  return offsets;
}

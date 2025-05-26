import { snip } from '../data/dataTypes.ts';
import { abstractInt, u32 } from '../data/numeric.ts';
import { ptrFn } from '../data/ptr.ts';
import type { AnyWgslData } from '../data/wgslTypes.ts';
import { isPtr, isWgslArray } from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';

export const arrayLength = createDualImpl(
  // CPU implementation
  (a: unknown[]) => a.length,
  // GPU implementation
  (a) => {
    if (
      isPtr(a.dataType) && isWgslArray(a.dataType.inner) &&
      a.dataType.inner.elementCount > 0
    ) {
      return snip(String(a.dataType.inner.elementCount), abstractInt);
    }
    return snip(`arrayLength(${a.value})`, u32);
  },
  (a) => [ptrFn(a.dataType as AnyWgslData)],
);

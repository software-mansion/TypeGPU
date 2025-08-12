import { stitch } from '../core/resolve/stitch.ts';
import { snip } from '../data/snippet.ts';
import { abstractInt, u32 } from '../data/numeric.ts';
import { ptrFn } from '../data/ptr.ts';
import type { AnyWgslData } from '../data/wgslTypes.ts';
import { isPtr, isWgslArray } from '../data/wgslTypes.ts';
import { createDualImpl } from '../core/function/dualImpl.ts';

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
    return snip(stitch`arrayLength(${a})`, u32);
  },
  'arrayLength',
  (a) => [ptrFn(a.dataType as AnyWgslData)],
);

import { u32 } from '../data/numeric.ts';
import { ptrFn } from '../data/ptr.ts';
import type { AnyWgslData } from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';

export const arrayLength = createDualImpl(
  // CPU implementation
  (a: unknown[]) => a.length,
  // GPU implementation
  (a) => ({ value: `arrayLength(${a.value})`, dataType: u32 }),
  (a) => [ptrFn(a.dataType as AnyWgslData)],
);

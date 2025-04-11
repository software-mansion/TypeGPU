import { u32 } from '../data/numeric.ts';
import { createDualImpl } from '../shared/generators.ts';

export const arrayLength = createDualImpl(
  // CPU implementation
  (a: unknown[]) => a.length,
  // GPU implementation
  (a) => ({ value: `arrayLength(&${a.value})`, dataType: u32 }),
);

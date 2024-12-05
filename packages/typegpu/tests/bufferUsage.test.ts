import { describe, expectTypeOf, it } from 'vitest';

import * as d from '../src/data';
import { asUniform } from '../src/experimental';
import type { Infer } from '../src/shared/repr';
import { mockRoot } from './utils/mockRoot';

describe('TgpuBufferReadonly', () => {
  const { getRoot } = mockRoot();

  it('represents a `number` value', () => {
    const root = getRoot();
    const buffer = root.createBuffer(d.f32).$usage('uniform');
    const uniform = asUniform(buffer);

    expectTypeOf<Infer<typeof uniform>>().toEqualTypeOf<number>();
  });
});

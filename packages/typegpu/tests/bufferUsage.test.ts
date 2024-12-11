import { describe, expectTypeOf } from 'vitest';

import * as d from '../src/data';
import { asUniform } from '../src/experimental';
import type { Infer } from '../src/shared/repr';
import { it } from './utils/myIt';

describe('TgpuBufferReadonly', () => {
  it('represents a `number` value', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform');
    const uniform = asUniform(buffer);

    expectTypeOf<Infer<typeof uniform>>().toEqualTypeOf<number>();
  });
});

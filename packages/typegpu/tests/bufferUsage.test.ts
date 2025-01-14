import { describe, expectTypeOf } from 'vitest';

import { asUniform } from '../src/core/buffer/bufferUsage';
import * as d from '../src/data';
import type { Infer } from '../src/shared/repr';
import { it } from './utils/extendedIt';

describe('TgpuBufferUniform', () => {
  it('represents a `number` value', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform');
    const uniform = asUniform(buffer);

    expectTypeOf<Infer<typeof uniform>>().toEqualTypeOf<number>();
  });
});

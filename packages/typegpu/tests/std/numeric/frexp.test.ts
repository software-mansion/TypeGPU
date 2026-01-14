import { describe, expect, expectTypeOf } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { frexp } from '../../../src/std/numeric.ts';
import { vec2f, vec3h } from '../../../src/data/vector.ts';
import type { v2f, v2i, v3i } from '../../../src/data/index.ts';
import type { v3h } from '../../../src/data/wgslTypes.ts';

describe('frexp', () => {
  it('gets inferred correctly', () => {
    let err: Error | undefined;
    try {
      const x = frexp(1);
      expectTypeOf(x).toEqualTypeOf<{ fract: number; exp: number }>();

      const y = frexp(vec2f(1, 2));
      expectTypeOf(y).toEqualTypeOf<{
        fract: v2f;
        exp: v2i;
      }>();

      const z = frexp(vec3h(1, 2, 3));
      expectTypeOf(z).toEqualTypeOf<{
        fract: v3h;
        exp: v3i;
      }>();
    } catch (error) {
      err = error as Error;
    }
    expect(err).toMatchInlineSnapshot(
      '[MissingCpuImplError: CPU implementation for frexp not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues]',
    );
  });
});

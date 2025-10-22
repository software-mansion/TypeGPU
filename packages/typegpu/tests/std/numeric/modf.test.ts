import { describe, expect, expectTypeOf } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { modf } from '../../../src/std/numeric.ts';
import { vec2f, vec3h } from '../../../src/data/vector.ts';
import type { v2f } from '../../../src/data/index.ts';
import type { v3h } from '../../../src/data/wgslTypes.ts';

describe('modf', () => {
  it('gets inferred correctly', () => {
    let err: Error | undefined;
    try {
      const x = modf(1);
      expectTypeOf(x).toEqualTypeOf<{ fract: number; whole: number }>();

      const y = modf(vec2f(1, 2));
      expectTypeOf(y).toEqualTypeOf<{
        fract: v2f;
        whole: v2f;
      }>();

      const z = modf(vec3h(1, 2, 3));
      expectTypeOf(z).toEqualTypeOf<{
        fract: v3h;
        whole: v3h;
      }>();
    } catch (error) {
      err = error as Error;
    }
    expect(err).toMatchInlineSnapshot(
      '[MissingCpuImplError: CPU implementation for modf not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues]',
    );
  });
});

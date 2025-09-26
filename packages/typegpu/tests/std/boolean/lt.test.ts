import { describe, expect, it } from 'vitest';
import * as d from '../../../src/data/index.ts';
import { lt } from '../../../src/std/index.ts';
import { asWgsl } from '../../utils/parseResolved.ts';

describe('lt', () => {
  it('compares numbers', () => {
    expect(lt(1, 0)).toStrictEqual(false);
    expect(lt(1, 1)).toStrictEqual(false);
    expect(lt(0, 1)).toStrictEqual(true);
  });

  it('compares integer vectors', () => {
    expect(lt(d.vec2i(1, -1), d.vec2i(0, 0))).toStrictEqual(
      d.vec2b(false, true),
    );
    expect(lt(d.vec3i(10, 20, 20), d.vec3i(10, 20, 30))).toStrictEqual(
      d.vec3b(false, false, true),
    );
    expect(lt(d.vec4i(1, 2, 3, 4), d.vec4i(4, 2, 3, 1))).toStrictEqual(
      d.vec4b(true, false, false, false),
    );
  });

  it('compares float vectors', () => {
    expect(lt(d.vec2f(0.1, 1.1), d.vec2f(0.1, 2))).toStrictEqual(
      d.vec2b(false, true),
    );
    expect(lt(d.vec3f(1.2, 2.3, 3.4), d.vec3f(2.3, 3.2, 3.4))).toStrictEqual(
      d.vec3b(true, true, false),
    );
    expect(
      lt(d.vec4f(0.1, -0.2, -0.3, 0.4), d.vec4f(0.1, 0.2, 0.3, 0.4)),
    ).toStrictEqual(d.vec4b(false, true, true, false));
  });

  it('accepts unions', () => {
    const a = 1 as number | d.v3f;
    const b = 0 as number | d.v3f;
    expect(lt(a, b)).toStrictEqual(false);
  });
});

describe('lt (on GPU)', () => {
  it('works', () => {
    expect(asWgsl(() => {
      'kernel';
      return lt(1, 0);
    })).toMatchInlineSnapshot(`""`);
  });
});

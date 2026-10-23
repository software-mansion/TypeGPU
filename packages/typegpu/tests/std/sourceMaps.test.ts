import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { d, ResolutionError, std, tgpu } from 'typegpu';

vi.mock('../../src/shared/env.ts', () => ({
  SOURCE_MAP: true,
  DEV: false,
  TEST: true,
}));

const fn1 = tgpu.fn([d.vec3f])((a) => {
  'use gpu';
  let b = d.vec3f();
  b = a;
});

function expectError(cb: () => void) {
  try {
    cb();
  } catch (err) {
    return err;
  }
  throw new Error('Expected callback to throw.');
}

describe('', () => {
  it('', () => {
    expect(() => tgpu.resolve([fn1])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn1: /Users/aleksander.katan/typepgu-monorepo/packages/typegpu/tests/std/sourceMaps.test.ts:13:2
      'b = a' is invalid, because references cannot be assigned.
      -----
      Try 'b = vec3f(a)' to copy the value instead.
      -----]
    `);
  });

  it('', () => {
    const err = expectError(() => tgpu.resolve([fn1])) as ResolutionError;

    expect(err.location?.file).toMatchInlineSnapshot(
      `"/Users/aleksander.katan/typepgu-monorepo/packages/typegpu/tests/std/sourceMaps.test.ts"`,
    );
    expect(err.location?.location).toMatchInlineSnapshot(`
      [
        13,
        2,
      ]
    `);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { d, ResolutionError, tgpu } from 'typegpu';

vi.mock('../../src/shared/env.ts', () => ({
  INCLUDE_SOURCE: true,
  DEV: false,
  TEST: true,
}));
vi.mock('../../dist/shared/env.js', () => ({
  INCLUDE_SOURCE: true,
  DEV: false,
  TEST: true,
}));

const fn0 = () => {
  'use gpu';
  let a = 0;
  let b = a++;
};

const fn1 = tgpu.fn([d.vec3f])((a) => {
  'use gpu';
  let b = d.vec3f();
  b = a;
});

const fn2 = () => {
  'use gpu';
  const a = d.vec3f();
  let b = a;
};

function expectError(cb: () => void) {
  try {
    cb();
  } catch (err) {
    return err;
  }
  throw new Error('Expected callback to throw.');
}

const stripRoot = (path: string | undefined) =>
  path !== undefined ? path.replace(/\/.*packages/, '<root-path>') : path;

describe('source mapped errors', () => {
  it('includes the source in the message', () => {
    const err = expectError(() => tgpu.resolve([fn1])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fn:fn1 (at <root-path>/typegpu/tests/std/sourceMaps.test.ts:24:3):
      'b = a' is invalid, because references cannot be assigned.
      -----
      Try 'b = vec3f(a)' to copy the value instead.
      -----"
    `);
  });

  it('includes the source as a property', () => {
    const err = expectError(() => tgpu.resolve([fn1])) as ResolutionError;

    expect(stripRoot(err.location?.file)).toMatchInlineSnapshot(
      `"<root-path>/typegpu/tests/std/sourceMaps.test.ts"`,
    );
    expect(err.location?.location).toMatchInlineSnapshot(`
      [
        24,
        3,
      ]
    `);
  });

  it('correctly formats message with no suggestions', () => {
    const err = expectError(() => tgpu.resolve([fn0])) as ResolutionError;
    const message = err.message.split('):\n').at(-1);

    expect(message).toMatchInlineSnapshot(
      `"'a++' is invalid because update is only allowed as a statement."`,
    );
  });

  it('correctly formats message with one suggestion', () => {
    const err = expectError(() => tgpu.resolve([fn1])) as ResolutionError;
    const message = err.message.split('):\n').at(-1);

    expect(message).toMatchInlineSnapshot(`
      "'b = a' is invalid, because references cannot be assigned.
      -----
      Try 'b = vec3f(a)' to copy the value instead.
      -----"
    `);
  });

  it('correctly formats message with multiple suggestions', () => {
    const err = expectError(() => tgpu.resolve([fn2])) as ResolutionError;
    const message = err.message.split('):\n').at(-1);

    expect(message).toMatchInlineSnapshot(`
      "'let b = a' is invalid, because references cannot be assigned to 'let' variable declarations.
      -----
      Try 'let b = vec3f(a)' if you need to reassign 'b' later.
      Try 'const b = a' if you won't reassign 'b' later.
      -----"
    `);
  });
});

import { describe, expect } from 'vitest';
// Importing directly from source, since we're testing internals
import { deserializeAndStringify } from '../../src/tgsl/consoleLog/deserializers.ts';
import { d } from '../../src/index.js';
import { it } from 'typegpu-testing-utility';

describe('deserializeAndStringify', () => {
  it('works for string literals', () => {
    const data = new Uint32Array([]);
    const logInfo: (string | d.AnyWgslData)[] = ['String literal'];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "String literal",
      ]
    `,
    );
  });

  it('works for u32', () => {
    const data = new Uint32Array([123]);
    const logInfo: (string | d.AnyWgslData)[] = [d.u32];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "123",
      ]
    `,
    );
  });

  it('works for vec3u', () => {
    const data = new Uint32Array([1, 2, 3]);
    const logInfo: (string | d.AnyWgslData)[] = [d.vec3u];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "vec3u(1, 2, 3)",
      ]
    `,
    );
  });

  it('works for clumped vectors', () => {
    const data = new Uint32Array([1, 2, 3, 4, 5, 6]); // no alignment
    const logInfo: (string | d.AnyWgslData)[] = [d.vec3u, d.vec3u];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "vec3u(1, 2, 3)",
        "vec3u(4, 5, 6)",
      ]
    `,
    );
  });

  it('works for multiple arguments', () => {
    const data = new Uint32Array([1, 2, 3, 456]);
    const logInfo: (string | d.AnyWgslData)[] = ['GID:', d.vec3u, 'Result:', d.u32];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "GID:",
        "vec3u(1, 2, 3)",
        "Result:",
        "456",
      ]
    `,
    );
  });

  it('works for arrays', () => {
    const data = new Uint32Array([1, 2, 3, 4]);
    const logInfo: (string | d.AnyWgslData)[] = [d.arrayOf(d.u32, 4)];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "[1, 2, 3, 4]",
      ]
    `,
    );
  });

  it('works for nested arrays', () => {
    const data = new Uint32Array([1, 2, 3, 4]);
    const logInfo: (string | d.AnyWgslData)[] = [d.arrayOf(d.arrayOf(d.u32, 2), 2)];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "[[1, 2], [3, 4]]",
      ]
    `,
    );
  });

  it('works for structs', () => {
    const data = new Uint32Array([1, 2, 3, 4]);
    const logInfo: (string | d.AnyWgslData)[] = [d.struct({ vec: d.vec3u, num: d.u32 })];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "{ vec: vec3u(1, 2, 3), num: 4 }",
      ]
    `,
    );
  });

  it('works for nested structs', () => {
    const data = new Uint32Array([1, 2, 3, 4, 1]);
    const logInfo: (string | d.AnyWgslData)[] = [
      d.struct({
        nested: d.struct({ vec: d.vec3u, num: d.u32 }),
        bool: d.bool,
      }),
    ];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "{ nested: { vec: vec3u(1, 2, 3), num: 4 }, bool: true }",
      ]
    `,
    );
  });
});

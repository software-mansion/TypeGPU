import { test } from 'typegpu-testing-utility';
import { expect } from 'vitest';
import { extractIdentifierLikeTokens } from '../../src/rawShaderCodeUtils.ts';

test('extractIdentifierLikeTokens extracts identifiers, skips typed numeric literal suffix (1f) and comments', () => {
  expect(
    extractIdentifierLikeTokens(
      `(a: i32, b: u32) -> vec3f {
      // a nice comment
    const hello = 1f;
    const point = boid.pos;
  }`,
    ),
  ).toMatchInlineSnapshot(`
    [
      "a",
      "i32",
      "b",
      "u32",
      "vec3f",
      "const",
      "hello",
      "const",
      "point",
      "boid",
    ]
  `);
});

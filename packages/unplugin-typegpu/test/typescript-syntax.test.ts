import { describe, expect, test } from 'vitest';
import { babelTransform } from './transform.ts';

// NOTE: rollup plugins receive source code stripped of types

describe('as type', () => {
  test('babel', () => {
    const code = `
    const hello = (a: number, b: number | undefined) => {
      'use gpu';
      return a + (b as number);
    };
  `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
    "const hello = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a: number, b: number | undefined) => {
      'use gpu';

      return __tsover_add(a, b as number);
    }, {
      v: 1,
      name: "hello",
      ast: {
        params: [{
          type: "i",
          name: "a"
        }, {
          type: "i",
          name: "b"
        }],
        body: [0, [[10, [1, "a", "+", "b"]]]],
        externalNames: []
      },
      externals: () => {
        return {};
      }
    }) && $.f)({});"
  `);
  });
});

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
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      const hello = /*#__PURE__*/__tgpu_meta((a: number, b: number | undefined) => {
        'use gpu';

        return __tsover_add(a, b as number);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "hello");"
    `);
  });
});

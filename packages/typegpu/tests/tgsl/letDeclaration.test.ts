import { it } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import tgpu, { d } from 'typegpu';
import { expectSnippetOf } from '../utils/parseResolved.ts';

describe('let declarations', () => {
  it('initializes a local definition with a scalar value', () => {
    function foo() {
      'use gpu';
      let a = d.f32(12);
      return a;
    }

    expectSnippetOf(foo).toStrictEqual(['a', d.f32, 'local-def']);

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() -> f32 {
        let a = 12f;
        return a;
      }"
    `);
  });

  it('concretizes an abstract int to i32', () => {
    function foo() {
      'use gpu';
      let a = 12;
      return a;
    }

    expectSnippetOf(foo).toStrictEqual(['a', d.i32, 'local-def']);

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() -> i32 {
        let a = 12;
        return a;
      }"
    `);
  });

  it('throws when initializing with a string', () => {
    function foo() {
      'use gpu';
      let a = '12';
      return a;
    }

    expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo(): 'let a = "12"' is invalid, cannot determine WGSL type of '"12"'
      -----
      - Try using or defining a schema that matches your desired value the most, and wrap the value with it: 'let a = Schema("12")'
      -----]
    `);
  });
});

import * as d from 'typegpu/data';
import { describe, expect } from 'vitest';
import { it } from './utils/extendedIt.ts';
import { asWgsl } from './utils/parseResolved.ts';

describe('ref', () => {
  it.skip('fails when created outside of a TypeGPU function', () => {
    expect(() => d.ref(0)).toThrowErrorMatchingInlineSnapshot();
  });

  it('creates a regular looking variable in WGSL', () => {
    const hello = () => {
      'use gpu';
      const ref = d.ref(0);
    };

    expect(asWgsl(hello)).toMatchInlineSnapshot(`
      "fn hello() {
        var ref_1 = 0;
      }"
    `);
  });

  it('fails when trying to assign a ref to an existing variable', () => {
    const update = (value: d.ref<number>) => {
      'use gpu';
      value.$ += 1;
    };

    const hello = () => {
      'use gpu';
      let foo = d.ref(0);
      update(foo);
      // Nuh-uh
      foo = d.ref(1);
      update(foo);
    };

    expect(() => asWgsl(hello)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:hello
      - fn*:hello: Cannot assign a ref to an existing variable '(&foo)', define a new variable instead.]
    `);
  });

  it('fails when creating a ref with a reference', () => {
    const hello = () => {
      'use gpu';
      const position = d.vec3f(1, 2, 3);
      const foo = d.ref(position);
    };

    expect(() => asWgsl(hello)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:hello
      - fn*:hello
      - fn:ref: Can't create refs from references. Copy the value first by wrapping it in its schema.]
    `);
  });
});

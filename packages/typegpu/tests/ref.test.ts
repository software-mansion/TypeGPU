import * as d from 'typegpu/data';
import { describe, expect } from 'vitest';
import { it } from './utils/extendedIt.ts';
import { asWgsl } from './utils/parseResolved.ts';

describe('ref', () => {
  it('fails when using a ref as an external', () => {
    const sup = d.ref(0);

    const foo = () => {
      'use gpu';
      sup.$ += 1;
    };

    expect(() => asWgsl(foo)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo(): Cannot use refs (d.ref(...)) from the outer scope.]
    `);
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
      - fn*:hello(): Cannot assign a ref to an existing variable '(&foo)', define a new variable instead.]
    `);
  });

  it('fails when creating a ref with a reference, and assigning it to a variable', () => {
    const hello = () => {
      'use gpu';
      const position = d.vec3f(1, 2, 3);
      const foo = d.ref(position);
    };

    expect(() => asWgsl(hello)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:hello
      - fn*:hello(): Cannot store d.ref() in a variable if it references another value. Copy the value passed into d.ref() instead.]
    `);
  });

  it('allows updating a whole struct from another function', () => {
    type Entity = d.Infer<typeof Entity>;
    const Entity = d.struct({ pos: d.vec3f });

    const clearEntity = (entity: d.ref<Entity>) => {
      'use gpu';
      entity.$ = Entity({ pos: d.vec3f(0, 0, 0) });
    };

    const main = () => {
      'use gpu';
      const entity = Entity({ pos: d.vec3f(1, 2, 3) });
      clearEntity(d.ref(entity));
      // entity.pos should be vec3f(0, 0, 0)
      return entity;
    };

    // Works in JS
    expect(main().pos).toStrictEqual(d.vec3f(0, 0, 0));

    // And on the GPU
    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "struct Entity {
        pos: vec3f,
      }

      fn clearEntity(entity: ptr<function, Entity>) {
        (*entity) = Entity(vec3f());
      }

      fn main() -> Entity {
        var entity = Entity(vec3f(1, 2, 3));
        clearEntity((&entity));
        return entity;
      }"
    `);
  });

  it('allows updating a number from another function', () => {
    const increment = (value: d.ref<number>) => {
      'use gpu';
      value.$ += 1;
    };

    const main = () => {
      'use gpu';
      const value = d.ref(0);
      increment(value);
      return value.$;
    };

    // Works in JS
    expect(main()).toBe(1);

    // And on the GPU
    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn increment(value: ptr<function, i32>) {
        (*value) += 1i;
      }

      fn main() -> i32 {
        var value = 0;
        increment((&value));
        return value;
      }"
    `);
  });

  it('rejects passing d.ref created from non-refs directly into functions', () => {
    const increment = (value: d.ref<number>) => {
      'use gpu';
      value.$ += 1;
    };

    const main = () => {
      'use gpu';
      increment(d.ref(0));
    };

    expect(() => asWgsl(main)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): d.ref() created with primitive types must be stored in a variable before use]
    `);
  });

  it('fails when returning a ref', () => {
    const foo = () => {
      'use gpu';
      const value = d.ref(0);
      return value;
    };

    const bar = () => {
      'use gpu';
      return d.ref(0);
    };

    expect(() => asWgsl(foo)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo(): Cannot return references, returning 'value']
    `);

    expect(() => asWgsl(bar)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:bar
      - fn*:bar(): Cannot return references, returning '0']
    `);
  });
});

import tgpu, { d } from '../src/index.js';
import { describe, expect } from 'vitest';
import { it } from './utils/extendedIt.ts';

describe('d.ref', () => {
  it('fails when using a ref as an external', () => {
    const sup = d.ref(0);

    const foo = () => {
      'use gpu';
      sup.$ += 1;
    };

    expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
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

    expect(tgpu.resolve([hello])).toMatchInlineSnapshot(`
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

    expect(() => tgpu.resolve([hello])).toThrowErrorMatchingInlineSnapshot(`
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

    expect(() => tgpu.resolve([hello])).toThrowErrorMatchingInlineSnapshot(`
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
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
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

  it('allows updating a struct property from another function', () => {
    type Entity = d.Infer<typeof Entity>;
    const Entity = d.struct({ pos: d.vec3f });

    const clearPosition = (entity: d.ref<Entity>) => {
      'use gpu';
      entity.pos = d.vec3f();
    };

    const main = () => {
      'use gpu';
      const entity = Entity({ pos: d.vec3f(1, 2, 3) });
      clearPosition(d.ref(entity));
      // entity.pos should be vec3f(0, 0, 0)
      return entity;
    };

    // Works in JS
    expect(main().pos).toStrictEqual(d.vec3f(0, 0, 0));

    // And on the GPU
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct Entity {
        pos: vec3f,
      }

      fn clearPosition(entity: ptr<function, Entity>) {
        (*entity).pos = vec3f();
      }

      fn main() -> Entity {
        var entity = Entity(vec3f(1, 2, 3));
        clearPosition((&entity));
        return entity;
      }"
    `);
  });

  it('allows updating a vector component from another function', () => {
    const clearX = (pos: d.ref<d.v3f>) => {
      'use gpu';
      pos.x = 0;
    };

    const main = () => {
      'use gpu';
      const pos = d.vec3f(1, 0, 0);
      clearX(d.ref(pos));
      // pos should be vec3f(0, 0, 0)
      return pos;
    };

    // Works in JS
    expect(main()).toStrictEqual(d.vec3f(0, 0, 0));

    // And on the GPU
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn clearX(pos: ptr<function, vec3f>) {
        (*pos).x = 0f;
      }

      fn main() -> vec3f {
        var pos = vec3f(1, 0, 0);
        clearX((&pos));
        return pos;
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
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
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

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
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

    expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo(): Cannot return references, returning 'value']
    `);

    expect(() => tgpu.resolve([bar])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:bar
      - fn*:bar(): Cannot return references, returning '0']
    `);
  });

  it('fails when taking a reference of an argument', () => {
    const advance = (value: d.ref<d.v3f>) => {
      'use gpu';
      value.$.x += 1;
    };

    const foo = (hello: d.v3f) => {
      'use gpu';
      // Trying to cheat and mutate a non-ref argument by taking a reference of it here.
      advance(d.ref(hello));
    };

    const main = () => {
      'use gpu';
      foo(d.vec3f());
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn*:foo(vec3f)
      - fn:ref: d.ref(hello) is illegal, cannot take a reference of an argument. Copy the value locally first, and take a reference of the copy.]
    `);
  });

  it('turns an implicit pointer into an explicit one', () => {
    const layout = tgpu.bindGroupLayout({
      positions: { storage: d.arrayOf(d.vec3f) },
    });

    const advance = (value: d.ref<d.v3f>) => {
      'use gpu';
      value.$.x += 1;
    };

    const main = () => {
      'use gpu';
      const pos = layout.$.positions[0]!;
      advance(d.ref(pos));
      d.ref(pos);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> positions: array<vec3f>;

      fn advance(value: ptr<storage, vec3f, read>) {
        (*value).x += 1f;
      }

      fn main() {
        let pos = (&positions[0i]);
        advance(pos);
        pos;
      }"
    `);
  });
});

import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';
import tgpu, { d } from '../../src/index.js';

describe('function argument origin tracking', () => {
  it('should fail on mutation of primitive arguments', () => {
    const foo = (a: number) => {
      'use gpu';
      a += 1;
    };

    const main = () => {
      'use gpu';
      foo(1);
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn*:foo(i32): 'a += 1i' is invalid, because non-pointer arguments cannot be mutated.]
    `);
  });

  it('should fail on mutation of destructured primitive arguments', () => {
    const Foo = d.struct({ a: d.f32 });

    const foo = ({ a }: { a: number }) => {
      'use gpu';
      a += 1;
    };

    const main = () => {
      'use gpu';
      foo(Foo({ a: 1 }));
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn*:foo(struct:Foo): '_arg_0.a += 1f' is invalid, because non-pointer arguments cannot be mutated.]
    `);
  });

  it('should fail on mutation of non-primitive arguments', () => {
    const foo = (a: d.v3f) => {
      'use gpu';
      a.x += 1;
    };

    const main = () => {
      'use gpu';
      foo(d.vec3f(1, 2, 3));
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn*:foo(vec3f): 'a.x += 1f' is invalid, because non-pointer arguments cannot be mutated.]
    `);
  });

  it('should fail on transitive mutation of non-primitive arguments', () => {
    const foo = (a: d.v3f) => {
      'use gpu';
      const b = a;
      b.x += 1;
    };

    const main = () => {
      'use gpu';
      foo(d.vec3f(1, 2, 3));
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn*:foo(vec3f): 'b.x += 1f' is invalid, because non-pointer arguments cannot be mutated.]
    `);
  });

  it('should fail on create a let variable from an argument reference', () => {
    const foo = (a: d.v3f) => {
      'use gpu';
      let b = a;
      b = d.vec3f();
      return b;
    };

    const main = () => {
      'use gpu';
      foo(d.vec3f(1, 2, 3));
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn*:foo(vec3f): 'let b = a' is invalid, because references to arguments cannot be assigned to 'let' variable declarations.
        -----
        - Try 'let b = vec3f(a)' if you need to reassign 'b' later
        - Try 'const b = a' if you won't reassign 'b' later.
        -----]
    `);
  });

  it('should fail on assigning an argument reference to a variable', () => {
    const foo = (a: d.v3f) => {
      'use gpu';
      let b = d.vec3f();
      b = a;
      return b;
    };

    const main = () => {
      'use gpu';
      foo(d.vec3f(1, 2, 3));
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn*:foo(vec3f): 'b = a' is invalid, because argument references cannot be assigned.
      -----
      Try 'b = vec3f(a)' to copy the value instead.
      -----]
    `);
  });

  it('should fail on returning an argument reference', () => {
    const foo = (a: d.v3f) => {
      'use gpu';
      return a;
    };

    const main = () => {
      'use gpu';
      foo(d.vec3f(7));
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn*:foo(vec3f): Cannot return references to arguments, returning 'a'. Copy the argument before returning it.]
    `);
  });
});

import { expect } from 'vitest';
import tgpu, { d, std } from '../../src/index.js';
import { test } from '../utils/extendedIt.ts';

test('should differentiate parameter names from existing declarations', () => {
  const fooFn = tgpu
    .fn(
      [d.f32],
      d.f32,
    )((a: number) => {
      'use gpu';
      return a * 2;
    })
    .$name('foo');

  const bar = (foo: number) => {
    'use gpu';
    return foo;
  };

  const main = () => {
    'use gpu';
    // Resolving `fooFn` first so that it's first to get the name `foo`
    return bar(fooFn(1.1));
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn foo(a: f32) -> f32 {
      return (a * 2f);
    }

    fn bar(foo_1: f32) -> f32 {
      return foo_1;
    }

    fn main() -> f32 {
      return bar(foo(1.1f));
    }"
  `);
});

test('should give new global declarations a unique name if it would clash with a parameter name', () => {
  const utils = {
    foo: tgpu
      .fn(
        [d.f32],
        d.f32,
      )((a: number) => {
        'use gpu';
        return a * 2;
      })
      .$name('foo'),
  };

  const bar = (foo: number) => {
    'use gpu';
    return utils.foo(foo);
  };

  const main = () => {
    'use gpu';
    return bar(1.1);
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn foo_1(a: f32) -> f32 {
      return (a * 2f);
    }

    fn bar(foo: f32) -> f32 {
      return foo_1(foo);
    }

    fn main() -> f32 {
      return bar(1.1f);
    }"
  `);
});

test('should give variables new names if they clash with a global declaration already used in the scope', () => {
  const fooFn = tgpu
    .fn(
      [d.f32],
      d.f32,
    )((a: number) => {
      'use gpu';
      return a * 2;
    })
    .$name('foo');

  const main = () => {
    'use gpu';
    const b = fooFn(1.2);
    const foo = 1.1; // foo is going to get a new name, because it would shadow `fooFn`
    const c = fooFn(1.3);
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn foo(a: f32) -> f32 {
      return (a * 2f);
    }

    fn main() {
      let b = foo(1.2f);
      const foo_1 = 1.1;
      let c = foo(1.3f);
    }"
  `);
});

test('should give declarations new names if they clash with a name in a function scope the declaration is meant to be referenced in', () => {
  const fooFn = tgpu
    .fn(
      [d.f32],
      d.f32,
    )((a: number) => {
      'use gpu';
      return a * 2;
    })
    .$name('foo');

  const main = () => {
    'use gpu';
    const foo = 1.1;
    // fooFn is going to get a new name, because it'd get shadowed by `foo`
    return fooFn(foo);
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn foo_1(a: f32) -> f32 {
      return (a * 2f);
    }

    fn main() -> f32 {
      const foo = 1.1;
      return foo_1(foo);
    }"
  `);
});

test('duplicate names across function scopes', ({ root }) => {
  const timeUniform = root.createUniform(d.f32).$name('time');

  const foo = (a: number) => {
    'use gpu';
    // Should declare time_1
    const time = timeUniform.$;
    return time * a;
  };

  const bar = (a: number) => {
    'use gpu';
    // Should declare time_1
    const time = timeUniform.$;
    return foo(time * a);
  };

  const main = () => {
    'use gpu';
    const some = timeUniform.$;
    return bar(some);
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "@group(0) @binding(0) var<uniform> time: f32;

    fn foo(a: f32) -> f32 {
      let time_1 = time;
      return (time_1 * a);
    }

    fn bar(a: f32) -> f32 {
      let time_1 = time;
      return foo((time_1 * a));
    }

    fn main() -> f32 {
      let some = time;
      return bar(some);
    }"
  `);
});

test('should give new names to functions that collide with builtins', () => {
  const min = tgpu
    .fn(
      [d.f32, d.f32],
      d.f32,
    )((a, b) => {
      return std.max(0, std.min(a, b));
    })
    .$name('min');

  const main = tgpu.fn([])(() => {
    const a = -1;
    const b = -2;
    const x = min(a, b);
    const y = std.min(a, b);
  });

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn min_1(a: f32, b: f32) -> f32 {
      return max(0f, min(a, b));
    }

    fn main() {
      const a = -1;
      const b = -2;
      let x = min_1(f32(a), f32(b));
      let y = min(a, b);
    }"
  `);
});

// TODO: enable when we transition to `rolldown`
// test('should allow duplicate name after block end', () => {
//   const main = () => {
//     'use gpu';
//     for (let i = 0; i < 3; i++) {
//       const foo = i + 1;
//     }
//     const foo = d.u32(7);
//     return foo;
//   };

//   expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
//       "fn main() -> u32 {
//         for (var i = 0; (i < 3i); i++) {
//           let foo = (i + 1i);
//         }
//         const foo = 7u;
//         return foo;
//       }"
//     `);
// });
//
// test('should give declarations new names when they are shadowed', () => {
//   const main = () => {
//     'use gpu';
//     const i = 0;
//     {
//       const i = 1;
//       {
//         const i = 2;
//       }
//     }
//   };

//   expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
//     "fn main() {
//       const i = 0;
//       {
//         const i_1 = 1;
//         {
//           const i_2 = 2;
//         }
//       }
//     }"
//   `);
// });

import { describe, expect } from 'vitest';
import { d, tgpu } from '../../src/index.js';
import { test } from '../utils/extendedIt.ts';

test('vec3f() +', () => {
  const main = () => {
    'use gpu';
    let result = d.vec3f();
    result += d.vec3f(1, 2, 3) + 1 /* comptime */;
    result += 1;
    return result;
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn main() -> vec3f {
      var result = vec3f();
      result += vec3f(2, 3, 4);
      result += 1;
      return result;
    }"
  `);

  expect(String(main())).toMatchInlineSnapshot(`"vec3f(3, 4, 5)"`);
});

test('vec3f() -', () => {
  const main = () => {
    'use gpu';
    let result = d.vec3f();
    result -= d.vec3f(1, 2, 3) + 1 /* comptime */;
    result -= 1;
    return result;
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn main() -> vec3f {
      var result = vec3f();
      result -= vec3f(2, 3, 4);
      result -= 1;
      return result;
    }"
  `);

  expect(String(main())).toMatchInlineSnapshot(`"vec3f(-3, -4, -5)"`);
});

test('vec3f() *', () => {
  const main = () => {
    'use gpu';
    let result = d.vec3f(1, 2, 3);
    result *= d.vec3f(5, 4, 3);
    result *= 2;
    return result;
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn main() -> vec3f {
      var result = vec3f(1, 2, 3);
      result *= vec3f(5, 4, 3);
      result *= 2;
      return result;
    }"
  `);

  expect(String(main())).toMatchInlineSnapshot(`"vec3f(10, 16, 18)"`);
});

test('vec3f() /', () => {
  const main = () => {
    'use gpu';
    let result = d.vec3f(1, 2, 3);
    result /= d.vec3f(2, 2, 3);
    result /= 2;
    return result;
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn main() -> vec3f {
      var result = vec3f(1, 2, 3);
      result /= vec3f(2, 2, 3);
      result /= 2;
      return result;
    }"
  `);

  expect(String(main())).toMatchInlineSnapshot(`"vec3f(0.25, 0.5, 0.5)"`);
});

test('vec3f() %', () => {
  const main = () => {
    'use gpu';
    let result = d.vec3f(11, 27, 31);
    result %= d.vec3f(2, 10, 3);
    result %= 5;
    return result;
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn main() -> vec3f {
      var result = vec3f(11, 27, 31);
      result %= vec3f(2, 10, 3);
      result %= 5;
      return result;
    }"
  `);

  expect(String(main())).toMatchInlineSnapshot(`"vec3f(1, 2, 1)"`);
});

test('+= refOfVec3f', () => {
  const constant = tgpu.const(d.vec3f, d.vec3f(-10));
  const foo = (arg: d.v3f) => {
    'use gpu';
    const local = d.vec3f(100, 10, 1);

    let result = d.vec3f();
    result += local;
    result += arg;
    result += constant.$;
    return result;
  };

  const main = () => {
    'use gpu';
    return foo(d.vec3f(1, 2, 3));
  };

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "const constant: vec3f = vec3f(-10);

    fn foo(arg: vec3f) -> vec3f {
      var local = vec3f(100, 10, 1);
      var result = vec3f();
      result += local;
      result += arg;
      result += constant;
      return result;
    }

    fn main() -> vec3f {
      return foo(vec3f(1, 2, 3));
    }"
  `);
  expect(main().toString()).toMatchInlineSnapshot(`"vec3f(91, 2, -6)"`);
});

describe('num op', () => {
  test('num +', () => {
    const main = () => {
      'use gpu';
      const result = 1 + d.vec3f(1, 2, 3) /* comptime */;
      return result;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> vec3f {
        var result = vec3f(2, 3, 4);
        return result;
      }"
    `);

    expect(String(main())).toMatchInlineSnapshot(`"vec3f(2, 3, 4)"`);
  });

  test('num -', () => {
    const main = () => {
      'use gpu';
      const result = 1 - d.vec3f(1, 2, 3) /* comptime */;
      return result;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> vec3f {
        var result = vec3f(0, -1, -2);
        return result;
      }"
    `);

    expect(String(main())).toMatchInlineSnapshot(`"vec3f(0, -1, -2)"`);
  });

  test('num *', () => {
    const main = () => {
      'use gpu';
      const result = 2 * d.vec3f(1, 2, 3) /* comptime */;
      return result;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> vec3f {
        var result = vec3f(2, 4, 6);
        return result;
      }"
    `);

    expect(String(main())).toMatchInlineSnapshot(`"vec3f(2, 4, 6)"`);
  });

  test('num /', () => {
    const main = () => {
      'use gpu';
      const result = 6 / d.vec3f(2, 3, 6) /* comptime */;
      return result;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> vec3f {
        var result = vec3f(3, 2, 1);
        return result;
      }"
    `);

    expect(String(main())).toMatchInlineSnapshot(`"vec3f(3, 2, 1)"`);
  });
});

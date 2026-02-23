import { describe, expect } from 'vitest';
import { d, tgpu } from '../../src/index.ts';
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

  expect(String(main())).toMatchInlineSnapshot(
    `"vec3f(0.25, 0.5, 0.5)"`,
  );
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

  expect(String(main())).toMatchInlineSnapshot(
    `"vec3f(1, 2, 1)"`,
  );
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

import { expect } from 'vitest';
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

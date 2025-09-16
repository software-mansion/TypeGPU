import { describe, expect } from 'vitest';
import tgpu from '../../src/index.ts';
import * as d from '../../src/data/index.ts';
import * as std from '../../src/std/index.ts';
import { it } from '../utils/extendedIt.ts';
import { asWgsl } from '../utils/parseResolved.ts';

describe('shellless', () => {
  it('is callable from shelled function', () => {
    type vf = d.v2f | d.v3f | d.v4f;

    const dot2 = (a: vf) => {
      'kernel';
      return std.dot(a, a);
    };

    const foo = () => {
      'kernel';
      return dot2(d.vec2f(1, 2)) + dot2(d.vec2f(3, 4));
    };

    const main = tgpu.fn([], d.f32)(() => {
      return foo();
    });

    expect(asWgsl(main)).toMatchInlineSnapshot(`
      "fn dot2(a: vec2f) -> f32 {
        return dot(a, a);
      }

      fn dot2_1(a: vec2f) -> f32 {
        return dot(a, a);
      }

      fn foo() -> f32 {
        return (dot2(vec2f(1, 2)) + dot2_1(vec2f(3, 4)));
      }

      fn main() -> f32 {
        return foo();
      }"
    `);
  });
});

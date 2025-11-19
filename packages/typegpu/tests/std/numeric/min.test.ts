import { describe, expect, it } from 'vitest';
import { min } from '../../../src/std/index.ts';
import tgpu from '../../../src/index.ts';
import { f32, i32 } from '../../../src/data/numeric.ts';

describe('min', () => {
  it('acts as identity when called with one argument', () => {
    const myMin = (a: number) => {
      'use gpu';
      return min(a);
    };

    const main = () => {
      'use gpu';
      const x = myMin(2);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn myMin(a: i32) -> i32 {
        return a;
      }

      fn main() {
        let x = myMin(2i);
      }"
    `);
  });

  it('works with multiple arguments', () => {
    const myMin = tgpu.fn([f32, f32, f32, i32], f32)((a, b, c, d) => {
      'use gpu';
      return min(a, b, c, d, 7);
    });

    expect(myMin(2, 1, 4, 5)).toBe(1);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin(a: f32, b: f32, c: f32, d: i32) -> f32 {
        return min(min(min(min(a, b), c), f32(d)), 7f);
      }"
    `);
  });
});

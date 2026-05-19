import { test } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import { d, std } from '../../src/index.js';
import tgpu from '../../src/index.js';

// range(n) — single argument, generates [0, n)
test('std.range - single arg', () => {
  expect(JSON.stringify(std.range(4))).toMatchInlineSnapshot(`"[0,1,2,3]"`);
  expect(JSON.stringify(std.range(0))).toMatchInlineSnapshot(`"[]"`);
  expect(JSON.stringify(std.range(1))).toMatchInlineSnapshot(`"[0]"`);
  expect(JSON.stringify(std.range(-1))).toMatchInlineSnapshot(`"[]"`);
});

// range(start, end) — two arguments, generates [start, end)
test('std.range - two args', () => {
  expect(JSON.stringify(std.range(2, 6))).toMatchInlineSnapshot(`"[2,3,4,5]"`);
  expect(JSON.stringify(std.range(0, 3))).toMatchInlineSnapshot(`"[0,1,2]"`);
  // start === end produces an empty range
  expect(JSON.stringify(std.range(3, 3))).toMatchInlineSnapshot(`"[]"`);
  // start > end produces an empty range
  expect(JSON.stringify(std.range(3, 2))).toMatchInlineSnapshot(`"[]"`);
  // negative start
  expect(JSON.stringify(std.range(-3, 1))).toMatchInlineSnapshot(`"[-3,-2,-1,0]"`);
});

// range(start, end, step) — three arguments, custom step
test('std.range - custom step', () => {
  expect(JSON.stringify(std.range(0, 10, 2))).toMatchInlineSnapshot(`"[0,2,4,6,8]"`);
  expect(JSON.stringify(std.range(0, 9, 3))).toMatchInlineSnapshot(`"[0,3,6]"`);
  // step larger than the range length — only start is included
  expect(JSON.stringify(std.range(1, 5, 10))).toMatchInlineSnapshot(`"[1]"`);
  // step === 1 explicitly
  expect(JSON.stringify(std.range(0, 3, 1))).toMatchInlineSnapshot(`"[0,1,2]"`);
});

// range with a negative step — descending ranges
test('std.range - negative step', () => {
  expect(JSON.stringify(std.range(5, 0, -1))).toMatchInlineSnapshot(`"[5,4,3,2,1]"`);
  expect(JSON.stringify(std.range(10, 0, -3))).toMatchInlineSnapshot(`"[10,7,4,1]"`);
  expect(JSON.stringify(std.range(3, -1, -1))).toMatchInlineSnapshot(`"[3,2,1,0]"`);
});

test('std.range - returns empty array when step direction mismatches range direction', () => {
  // positive range, negative step
  expect(JSON.stringify(std.range(0, 5, -1))).toMatchInlineSnapshot(`"[]"`);
  // negative range, positive step
  expect(JSON.stringify(std.range(5, 0, 1))).toMatchInlineSnapshot(`"[]"`);
});

// error cases
test('std.range - throws on zero step', () => {
  expect(() => std.range(0, 5, 0)).toThrowErrorMatchingInlineSnapshot(
    `[Error: 'step' must be a non-zero integer, got 0]`,
  );
});

test('std.range - float step', () => {
  expect(() => std.range(0, 1, 0.25)).toThrowErrorMatchingInlineSnapshot(
    `[Error: 'step' must be a non-zero integer, got 0.25]`,
  );
});

describe('on the GPU', () => {
  test('std.range - assigned to a variable', () => {
    function main() {
      'use gpu';
      const result = d.arrayOf(d.f32, 4)(std.range(0, 8, 2));
      return result;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> array<f32, 4> {
        let result = array<f32, 4>(0f, 2f, 4f, 6f);
        return result;
      }"
    `);
  });

  test('std.range - assigned to a variable', () => {
    function main() {
      'use gpu';
      const result = d.arrayOf(d.f32, 4)(std.range(0, 8, 2));
      return result;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> array<f32, 4> {
        let result = array<f32, 4>(0f, 2f, 4f, 6f);
        return result;
      }"
    `);
  });

  test('std.range - valid for of iterable', () => {
    function main() {
      'use gpu';
      let result = d.f32(0);
      for (const value of std.range(0, 8, 2)) {
        result += value;
      }
      for (const value of std.range(10, -10, -1)) {
        result += value;
      }
      return result;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        var result = 0f;
        for (var i = 0u; i < 8u; i += 2u) {
          result += f32(i);
        }
        for (var i = 10i; i > -10i; i += -1i) {
          result += f32(i);
        }
        return result;
      }"
    `);
  });
});

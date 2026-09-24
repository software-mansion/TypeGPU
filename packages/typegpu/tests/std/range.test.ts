import { test } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import { tgpu, d, std } from 'typegpu';

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

describe('passed into comptime functions', () => {
  type TgpuRange = ReturnType<typeof std.range>;

  const inspect = tgpu.comptime((value: TgpuRange) =>
    tgpu['~unstable'].rawCodeSnippet(
      `// isArray=${Array.isArray(value)} value=${JSON.stringify(value)} start=${value.start} end=${value.end} step=${value.step}`,
      d.Void,
    ),
  );

  test('receives the range as an array, along with its metadata', () => {
    function main() {
      'use gpu';
      inspect(std.range(1, 7, 2)).$;
      inspect(std.range(3)).$;
      inspect(std.range(3, -1, -1)).$;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        // isArray=true value=[1,3,5] start=1 end=7 step=2;
        // isArray=true value=[0,1,2] start=0 end=3 step=1;
        // isArray=true value=[3,2,1,0] start=3 end=-1 step=-1;
      }"
    `);
  });

  test('receives a range created outside of the shader', () => {
    const outerRange = std.range(4);

    function main() {
      'use gpu';
      inspect(outerRange).$;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        // isArray=true value=[0,1,2,3] start=0 end=4 step=1;
      }"
    `);
  });

  test('receives a range created from comptime-known expressions', () => {
    const count = tgpu.comptime(() => 2);
    const OFFSET = 3;

    function main() {
      'use gpu';
      inspect(std.range(OFFSET, OFFSET + count() * 2)).$;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        // isArray=true value=[3,4,5,6] start=3 end=7 step=1;
      }"
    `);
  });

  test('can be reduced into a constant', () => {
    const sum = tgpu.comptime((values: number[]) => values.reduce((a, b) => a + b, 0));
    const len = tgpu.comptime((values: number[]) => values.length);

    function main() {
      'use gpu';
      return sum(std.range(5)) + len(std.range(0, 10, 3));
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        return 14;
      }"
    `);
  });

  test('can be transformed into another range and iterated over', () => {
    const reversed = tgpu.comptime((r: TgpuRange) =>
      std.range(r.end - r.step, r.start - r.step, -r.step),
    );

    function main() {
      'use gpu';
      let acc = d.f32();
      for (const i of reversed(std.range(4))) {
        acc += d.f32(i);
      }
      return acc;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        var acc = 0f;
        for (var i = 3i; i > -1i; i += -1i) {
          acc += f32(i);
        }
        return acc;
      }"
    `);
  });

  test('receives the underlying range when wrapped in tgpu.unroll', () => {
    function main() {
      'use gpu';
      inspect(tgpu.unroll(std.range(3))).$;
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        // isArray=true value=[0,1,2] start=0 end=3 step=1;
      }"
    `);
  });

  test('throws when an unrolled runtime-known iterable is passed in', () => {
    const sum = tgpu.comptime((values: number[]) => values.reduce((a, b) => a + b, 0));

    function main() {
      'use gpu';
      const values = d.arrayOf(d.f32, 3)(std.range(3));
      return sum(tgpu.unroll(values));
    }

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn:sum: Called comptime function with runtime-known values: 'tgpu.unroll(values)']
    `);
  });

  test('throws when the range is created with runtime-known values', () => {
    function main() {
      'use gpu';
      const n = d.u32(3);
      inspect(std.range(n)).$;
    }

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn:range: Called comptime function with runtime-known values: 'n']
    `);
  });
});

import { describe, expect } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';

const floatLiterals = tgpu['~unstable'].preferFloatLiterals;

describe('preferFloatLiterals', () => {
  it('defaults whole-number variables to f32', () => {
    const main = () => {
      'use gpu';
      let a = 1;
      a = a / 2;
      const b = 2;
      return a * b;
    };

    expect(tgpu.resolve([tgpu.fn([], d.f32)(main).with(floatLiterals, true)]))
      .toMatchInlineSnapshot(`
        "fn main() -> f32 {
          var a: f32 = 1;
          a = (a / 2f);
          const b: f32 = 2;
          return (a * b);
        }"
      `);
  });

  it('keeps the old behavior when disabled', () => {
    const main = () => {
      'use gpu';
      let a = 1;
      a = a / 2;
      return a;
    };

    expect(tgpu.resolve([tgpu.fn([], d.i32)(main).with(floatLiterals, false)]))
      .toMatchInlineSnapshot(`
      "fn main() -> i32 {
        var a = 1;
        a = i32((f32(a) / 2f));
        return a;
      }"
    `);
  });

  it('collapses loop counters used as indices to i32', () => {
    const arr = tgpu.const(d.arrayOf(d.f32, 4), [1, 2, 3, 4]);

    const main = () => {
      'use gpu';
      let sum = 0;
      for (let i = 0; i < 4; i++) {
        sum += arr.$[i] as number;
      }
      return sum;
    };

    expect(tgpu.resolve([tgpu.fn([], d.f32)(main).with(floatLiterals, true)]))
      .toMatchInlineSnapshot(`
        "const arr: array<f32, 4> = array<f32, 4>(1f, 2f, 3f, 4f);

        fn main() -> f32 {
          var sum: f32 = 0;
          for (var i = 0; (i < 4); i++) {
            sum += arr[i];
          }
          return sum;
        }"
      `);
  });

  it('defaults loop counters to f32 when used as floats first', () => {
    const main = () => {
      'use gpu';
      let acc = d.f32(0);
      for (let i = 0; i < 10; i++) {
        acc += std.sin(i / 10);
      }
      return acc;
    };

    expect(tgpu.resolve([tgpu.fn([], d.f32)(main).with(floatLiterals, true)]))
      .toMatchInlineSnapshot(`
        "fn main() -> f32 {
          var acc = 0f;
          for (var i: f32 = 0; (i < 10); i += 1) {
            acc += sin((i / 10f));
          }
          return acc;
        }"
      `);
  });

  it('collapses when passed into a function expecting an i32', () => {
    const takesInt = tgpu.fn([d.i32], d.i32)((x) => x * 2);

    const main = () => {
      'use gpu';
      let count = 0;
      let i = 0;
      while (i < 10) {
        count = count + takesInt(i);
        i++;
      }
      return count;
    };

    expect(tgpu.resolve([tgpu.fn([], d.f32)(main).with(floatLiterals, true)]))
      .toMatchInlineSnapshot(`
        "fn takesInt(x: i32) -> i32 {
          return (x * 2i);
        }

        fn main() -> f32 {
          var count = 0;
          var i = 0;
          while ((i < 10)) {
            count = (count + takesInt(i));
            i++;
          }
          return f32(count);
        }"
      `);
  });

  it('links variables initialized from one another', () => {
    const arr = tgpu.const(d.arrayOf(d.f32, 4), [1, 2, 3, 4]);

    const main = () => {
      'use gpu';
      const n = 4;
      let i = 0;
      const j = i + 1;
      let total = arr.$[j] as number;
      while (i < n) {
        i++;
      }
      return total;
    };

    expect(tgpu.resolve([tgpu.fn([], d.f32)(main).with(floatLiterals, true)]))
      .toMatchInlineSnapshot(`
        "const arr: array<f32, 4> = array<f32, 4>(1f, 2f, 3f, 4f);

        fn main() -> f32 {
          const n = 4;
          var i = 0;
          let j = (i + 1);
          let total = arr[j];
          while ((i < n)) {
            i++;
          }
          return total;
        }"
      `);
  });

  it('defaults undecided shellless parameters to f32', () => {
    const double = (x: number) => {
      'use gpu';
      return x * 2;
    };

    const main = () => {
      'use gpu';
      return double(3);
    };

    expect(tgpu.resolve([tgpu.fn([], d.f32)(main).with(floatLiterals, true)]))
      .toMatchInlineSnapshot(`
        "fn double(x: f32) -> f32 {
          return (x * 2);
        }

        fn main() -> f32 {
          return double(3f);
        }"
      `);
  });

  it('lets shellless functions decide the types of whole-number arguments', () => {
    const pixels = tgpu.const(
      d.arrayOf(d.f32, 16),
      Array.from({ length: 16 }, () => 0),
    );

    const getPixel = (x: number, y: number) => {
      'use gpu';
      return pixels.$[x + y * 4] as number;
    };

    const scale = (v: number) => {
      'use gpu';
      return v * 0.5;
    };

    const main = () => {
      'use gpu';
      let i = 0;
      const a = getPixel(0, 1);
      const b = getPixel(i, i);
      return a + b + scale(2);
    };

    expect(tgpu.resolve([tgpu.fn([], d.f32)(main).with(floatLiterals, true)]))
      .toMatchInlineSnapshot(`
        "const pixels: array<f32, 16> = array<f32, 16>(0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f);

        fn getPixel(x: i32, y: i32) -> f32 {
          return pixels[(x + (y * 4))];
        }

        fn scale(v: f32) -> f32 {
          return (v * 0.5);
        }

        fn main() -> f32 {
          let i = 0;
          let a = getPixel(0i, 1i);
          let b = getPixel(i, i);
          return ((a + b) + scale(2f));
        }"
      `);
  });

  it('reuses shellless variants whose parameter types were decided by their body', () => {
    const values = tgpu.const(d.arrayOf(d.f32, 4), [0, 0, 0, 0]);

    const get = (idx: number) => {
      'use gpu';
      return values.$[idx] as number;
    };

    const main = () => {
      'use gpu';
      let i = 0;
      const j = d.i32(2);
      return get(i) + get(j);
    };

    expect(tgpu.resolve([tgpu.fn([], d.f32)(main).with(floatLiterals, true)]))
      .toMatchInlineSnapshot(`
      "const values: array<f32, 4> = array<f32, 4>(0f, 0f, 0f, 0f);

      fn get_1(idx: i32) -> f32 {
        return values[idx];
      }

      fn main() -> f32 {
        let i = 0;
        const j = 2i;
        return (get_1(i) + get_1(j));
      }"
    `);
  });

  it('decides the types of variables passed into console.log', ({ root }) => {
    const main = tgpu.computeFn({ workgroupSize: [1] })(() => {
      'use gpu';
      let i = 0;
      console.log(i);
    });

    const pipeline = root.with(floatLiterals, true).createComputePipeline({ compute: main });
    const code = tgpu.resolve([pipeline]);
    expect(code).toContain('fn log1(_arg_0: f32)');
    expect(code).toContain('let i: f32 = 0;');
  });
});

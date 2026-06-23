import { beforeEach, describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { expectDataTypeOf, extractSnippetFromFn } from '../utils/parseResolved.ts';
import tgpu, { d, std } from '../../src/index.js';

const numberSlot = tgpu.slot(44);
const lazyV4u = tgpu.lazy(() => d.vec4u(1, 2, 3, 4).mul(numberSlot.$));
const lazyV2f = tgpu.lazy(() => d.vec2f(1, 2).mul(numberSlot.$));

describe('wgslGenerator', () => {
  it('creates a simple return statement', () => {
    const main = () => {
      'use gpu';
      return true;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> bool {
        return true;
      }"
    `);
  });

  it('creates a function body', () => {
    const main = () => {
      'use gpu';
      let a = 12;
      a += 21;
      return a;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        var a = 12;
        a += 21i;
        return a;
      }"
    `);
  });

  it('creates correct resources for numeric literals', () => {
    expect(
      extractSnippetFromFn(() => {
        'use gpu';
        return 12;
      }).dataType.toString(),
    ).toBe('abstractInt');

    expect(
      extractSnippetFromFn(() => {
        'use gpu';
        return 12.5;
      }).dataType.toString(),
    ).toBe('abstractFloat');

    expect(
      extractSnippetFromFn(() => {
        'use gpu';
        return 12e10;
      }).dataType.toString(),
    ).toBe('abstractInt');

    expect(
      extractSnippetFromFn(() => {
        'use gpu';
        return 1.2e-3;
      }).dataType.toString(),
    ).toBe('abstractFloat');
  });

  it('generates correct resources for member access expressions', ({ root }) => {
    const TestStruct = d.struct({
      a: d.u32,
      b: d.vec2u,
    });

    const testBuffer = root.createBuffer(TestStruct).$usage('storage');
    const testUsage = testBuffer.as('mutable');

    expectDataTypeOf(() => {
      'use gpu';
      return testUsage.$.a;
    }).toStrictEqual(d.u32);

    expectDataTypeOf(() => {
      'use gpu';
      return testUsage.$.b.x;
    }).toStrictEqual(d.u32);

    expectDataTypeOf(() => {
      'use gpu';
      return testUsage.$.a + testUsage.$.b.x;
    }).toStrictEqual(d.u32);
  });

  it('generates correct resources for external resource array index access', ({ root }) => {
    const testBuffer = root.createBuffer(d.arrayOf(d.u32, 16)).$usage('uniform');

    const testUsage = testBuffer.as('uniform');

    expectDataTypeOf(() => {
      'use gpu';
      return testUsage.$[3];
    }).toStrictEqual(d.u32);
  });

  it('generates correct resources for nested struct with atomics in a complex expression', ({
    root,
  }) => {
    const testBuffer = root
      .createBuffer(
        d
          .struct({
            a: d.vec4f,
            b: d
              .struct({
                aa: d.arrayOf(
                  d.struct({ x: d.atomic(d.u32), y: d.atomic(d.i32) }).$name('DeeplyNestedStruct'),
                  64,
                ),
              })
              .$name('NestedStruct'),
          })
          .$name('TestStruct'),
      )
      .$usage('storage');

    const testUsage = testBuffer.as('mutable');

    // Check for: const value = std.atomicLoad(testUsage.$.b.aa[idx]!.y);
    //                           ^ this part should be a i32
    expectDataTypeOf(() => {
      'use gpu';
      const idx = d.u32(0);
      return std.atomicLoad(testUsage.$.b.aa[idx]!.y);
    }).toStrictEqual(d.i32);

    // Check for: const vec = std.mix(d.vec4f(), testUsage.$.a, value);
    //                        ^ this part should be a vec4f
    expectDataTypeOf(() => {
      'use gpu';
      const value = std.atomicLoad(testUsage.$.b.aa[0]!.y);
      return std.mix(d.vec4f(), testUsage.$.a, value);
    }).toStrictEqual(d.vec4f);

    // Check for: std.atomicStore(testUsage.$.b.aa[idx]!.x, vec.y);
    //                            ^ this part should be an atomic u32
    expectDataTypeOf(() => {
      'use gpu';
      const idx = d.u32(0);
      return testUsage.$.b.aa[idx]!.x;
    }).toStrictEqual(d.atomic(d.u32));
  });

  it('parses correctly "for ... of ..." statements', () => {
    const main1 = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const foo of arr) {
        continue;
      }
    };

    const main2 = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (let foo of arr) {
        continue;
      }
    };

    expect(tgpu.resolve([main1])).toMatchInlineSnapshot(`
      "fn main1() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i += 1u) {
          let foo = arr[i];
          {
            continue;
          }
        }
      }"
    `);

    expect(() => tgpu.resolve([main2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main2
      - fn*:main2(): Only \`for (const ... of ... )\` loops are supported]
    `);
  });

  it('creates correct code for "for ... of ..." statement using array of primitives', () => {
    const main = () => {
      'use gpu';
      const arr = d.arrayOf(d.f32, 3)([1, 2, 3]);
      let res = d.f32();
      for (const foo of arr) {
        res += foo;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var arr = array<f32, 3>(1f, 2f, 3f);
        var res = 0f;
        for (var i = 0u; i < 3u; i += 1u) {
          let foo = arr[i];
          {
            res += foo;
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." nested statements', () => {
    const main = () => {
      'use gpu';
      const arr = d.arrayOf(d.f32, 3)([1, 2, 3]);
      let res = d.f32();
      for (const foo of arr) {
        for (const boo of arr) {
          res += foo * boo;
        }
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var arr = array<f32, 3>(1f, 2f, 3f);
        var res = 0f;
        for (var i = 0u; i < 3u; i += 1u) {
          let foo = arr[i];
          {
            for (var i_1 = 0u; i_1 < 3u; i_1 += 1u) {
              let boo = arr[i_1];
              {
                res += (foo * boo);
              }
            }
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." nested statements that use the same variable name', () => {
    const main = () => {
      'use gpu';
      const arr = d.arrayOf(d.f32, 3)([1, 2, 3]);
      let res = d.f32();
      for (const foo of arr) {
        for (const foo of arr) {
          res += foo * foo;
        }
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var arr = array<f32, 3>(1f, 2f, 3f);
        var res = 0f;
        for (var i = 0u; i < 3u; i += 1u) {
          let foo = arr[i];
          {
            for (var i_1 = 0u; i_1 < 3u; i_1 += 1u) {
              let foo_1 = arr[i_1];
              {
                res += (foo_1 * foo_1);
              }
            }
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statement using array of non-primitives', () => {
    const main = () => {
      'use gpu';
      const arr = d.arrayOf(d.vec2f, 3)([d.vec2f(1), d.vec2f(2), d.vec2f(3)]);
      let res = 0;
      for (const foo of arr) {
        res += foo.x;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var arr = array<vec2f, 3>(vec2f(1), vec2f(2), vec2f(3));
        var res = 0;
        for (var i = 0u; i < 3u; i += 1u) {
          let foo = (&arr[i]);
          {
            res += i32((*foo).x);
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statement using runtime size array', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.f32) },
    });

    const main = () => {
      'use gpu';
      let res = d.f32(0);
      for (const foo of layout.$.arr) {
        res += foo;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> arr: array<f32>;

      fn main() {
        var res = 0f;
        for (var i = 0u; i < arrayLength((&arr)); i += 1u) {
          let foo = arr[i];
          {
            res += foo;
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statements using lazy and comptime iterables', () => {
    const comptimeVec = tgpu.comptime(() => d.vec2f(1, 2));

    const main = () => {
      'use gpu';
      const v1 = lazyV4u.$;
      for (const foo of v1) {
        continue;
      }

      const v2 = comptimeVec();
      for (const foo of v2) {
        continue;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var v1 = vec4u(44, 88, 132, 176);
        for (var i = 0u; i < 4u; i += 1u) {
          let foo = v1[i];
          {
            continue;
          }
        }
        var v2 = vec2f(1, 2);
        for (var i = 0u; i < 2u; i += 1u) {
          let foo = v2[i];
          {
            continue;
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statements using buffer iterable', ({ root }) => {
    const b = root.createUniform(d.arrayOf(d.u32, 7));
    const acc = tgpu.accessor(d.arrayOf(d.u32, 7), b);

    const f = () => {
      'use gpu';
      let result = d.u32(0);
      for (const foo of acc.$) {
        result += foo;
      }

      return result;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> b: array<u32, 7>;

      fn f() -> u32 {
        var result = 0u;
        for (var i = 0u; i < 7u; i += 1u) {
          let foo = b[i];
          {
            result += foo;
          }
        }
        return result;
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statements using vector iterables', () => {
    const main = () => {
      'use gpu';
      const v1 = d.vec4f(1, 2, 3, 4);
      const v2 = d.vec3u(5, 6, 7);
      const v3 = d.vec2b(true, false);

      let res1 = d.f32();
      let res2 = d.u32();
      let res3 = d.bool();

      for (const foo of v1) {
        res1 += foo;
      }

      for (const foo of v2) {
        res2 *= foo;
      }

      for (const foo of v3) {
        res3 = foo !== res3;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var v1 = vec4f(1, 2, 3, 4);
        var v2 = vec3u(5, 6, 7);
        var v3 = vec2<bool>(true, false);
        var res1 = 0f;
        var res2 = 0u;
        var res3 = false;
        for (var i = 0u; i < 4u; i += 1u) {
          let foo = v1[i];
          {
            res1 += foo;
          }
        }
        for (var i = 0u; i < 3u; i += 1u) {
          let foo = v2[i];
          {
            res2 *= foo;
          }
        }
        for (var i = 0u; i < 2u; i += 1u) {
          let foo = v3[i];
          {
            res3 = (foo != res3);
          }
        }
      }"
    `);
  });

  it('creates correct code for "for ... of ..." statement using a struct member iterable', () => {
    const TestStruct = d.struct({
      arr: d.arrayOf(d.f32, 4),
    });

    const main = () => {
      'use gpu';
      const testStruct = TestStruct({ arr: [1, 8, 8, 2] });
      for (const foo of testStruct.arr) {
        continue;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct TestStruct {
        arr: array<f32, 4>,
      }

      fn main() {
        var testStruct = TestStruct(array<f32, 4>(1f, 8f, 8f, 2f));
        for (var i = 0u; i < 4u; i += 1u) {
          let foo = testStruct.arr[i];
          {
            continue;
          }
        }
      }"
    `);
  });

  it('throws error when "for ... of ..." statement uses an ephemeral iterable', () => {
    const main = () => {
      'use gpu';
      for (const foo of [1, 2, 3]) {
        continue;
      }
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): \`for ... of ...\` loops only support std.range or iterables stored in variables.
      -----
      You can wrap iterable with \`tgpu.unroll(...)\`. If iterable is known at comptime, the loop will be unrolled.
      -----]
    `);
  });

  it('throws error when "for ... of ..." statement uses iterable that is not an array or a vector', () => {
    const TestStruct = d.struct({
      x: d.u32,
      y: d.f32,
    });

    const main = () => {
      'use gpu';
      const testStruct = TestStruct({ x: 1, y: 2 });
      // @ts-expect-error: let's assume it has an iterator
      for (const foo of testStruct) {
        continue;
      }
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): \`for ... of ...\` loops only support array or vector iterables]
    `);
  });

  it('throws error when "for ... of ..." statement uses let declarator', () => {
    const main = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (let foo of arr) {
        continue;
      }
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Only \`for (const ... of ... )\` loops are supported]
    `);
  });

  it('renames "for ... of ..." loop variable name when it is not correct in WGSL', () => {
    const main = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const __foo of arr) {
        continue;
      }
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i += 1u) {
          let item = arr[i];
          {
            continue;
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is used by user', () => {
    const f1 = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const foo of arr) {
        const i = foo;
      }
    };

    expect(tgpu.resolve([f1])).toMatchInlineSnapshot(`
      "fn f1() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i += 1u) {
          let foo = arr[i];
          {
            let i_1 = foo;
          }
        }
      }"
    `);

    const f2 = () => {
      'use gpu';
      const i = 7;
      const arr = [1, 2, 3];
      for (const foo of arr) {
        continue;
      }
    };

    expect(tgpu.resolve([f2])).toMatchInlineSnapshot(`
      "fn f2() {
        const i = 7;
        var arr = array<i32, 3>(1, 2, 3);
        for (var i_1 = 0u; i_1 < 3u; i_1 += 1u) {
          let foo = arr[i_1];
          {
            continue;
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is the buffer used earlier', ({
    root,
  }) => {
    const i = root.createUniform(d.u32, 7);

    const f = () => {
      'use gpu';
      const arr = [1, 2, 3, i.$];
      for (const foo of arr) {
        continue;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> i: u32;

      fn f() {
        var arr = array<u32, 4>(1u, 2u, 3u, i);
        for (var i_1 = 0u; i_1 < 4u; i_1 += 1u) {
          let foo = arr[i_1];
          {
            continue;
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is the buffer used later', ({
    root,
  }) => {
    const i = root.createUniform(d.u32, 7);
    const f = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const foo of arr) {
        const x = foo + i.$;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> i_1: u32;

      fn f() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i += 1u) {
          let foo = arr[i];
          {
            let x = (foo + i32(i_1));
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is the buffer returned from accessor', ({
    root,
  }) => {
    const i = root.createUniform(d.u32, 7);

    const acc = tgpu.accessor(d.u32, () => i.$);

    const f = () => {
      'use gpu';
      const arr = [1, 2, 3];
      for (const foo of arr) {
        const x = foo + acc.$;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> i_1: u32;

      fn f() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i += 1u) {
          let foo = arr[i];
          {
            let x = (foo + i32(i_1));
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." internal index variable when "i" is the loop variable', () => {
    const f = () => {
      'use gpu';
      const arr = [1, 2, 3];
      let res = 0;
      for (const i of arr) {
        res += i;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var arr = array<i32, 3>(1, 2, 3);
        var res = 0;
        for (var i = 0u; i < 3u; i += 1u) {
          let i_1 = arr[i];
          {
            res += i_1;
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." loop variable name when there is shadowing', ({ root }) => {
    const i = root.createUniform(d.u32, 7);

    const f = () => {
      'use gpu';
      const arr = [1, 2, 3, i.$];
      let res = 0;
      for (const i of arr) {
        res += i;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> i: u32;

      fn f() {
        var arr = array<u32, 4>(1u, 2u, 3u, i);
        var res = 0;
        for (var i_1 = 0u; i_1 < 4u; i_1 += 1u) {
          let i_2 = arr[i_1];
          {
            res += i32(i_2);
          }
        }
      }"
    `);
  });

  it('handles "for ... of ..." over `std.range`', ({ root }) => {
    const testFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      for (const bounce of std.range(12)) {
        const test = d.u32(2) + bounce;
        return d.f32(test);
      }
      return 0;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> f32 {
        for (var i = 0u; i < 12u; i += 1u) {
          let test = (2u + i);
          return f32(test);
        }
        return 0f;
      }"
    `);
  });

  it('creates correct resources for lazy values and slots', () => {
    expectDataTypeOf(() => {
      'use gpu';
      return lazyV4u.$;
    }).toStrictEqual(d.vec4u);

    const testFn = tgpu.fn([], d.vec4u)(() => lazyV4u.$);

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> vec4u {
        return vec4u(44, 88, 132, 176);
      }"
    `);
  });

  it('creates correct resources for indexing into a lazy value', () => {
    expectDataTypeOf(() => {
      'use gpu';
      const idx = d.u32(0);
      return lazyV2f.$[idx];
    }).toStrictEqual(d.f32);
  });

  it('generates correct code for array expressions', () => {
    const testFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      const arr = [d.u32(1), 2, 3];
      return arr[1] as number;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> u32 {
        let arr = array<u32, 3>(1u, 2u, 3u);
        return arr[1i];
      }"
    `);
  });

  it('generates correct code for complex array expressions', () => {
    const testFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      const arr = [d.vec2u(1, 2), d.vec2u(3, 4), std.min(d.vec2u(5, 8), d.vec2u(7, 6))] as [
        d.v2u,
        d.v2u,
        d.v2u,
      ];
      return arr[1].x;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> u32 {
        let arr = array<vec2u, 3>(vec2u(1, 2), vec2u(3, 4), vec2u(5, 6));
        return arr[1i].x;
      }"
    `);
  });

  it('does not autocast lhs of an assignment', () => {
    const testFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      let a = d.u32(12);
      const b = d.f32(2.5);
      a = b;

      return a;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> u32 {
        var a = 12u;
        const b = 2.5f;
        a = u32(b);
        return a;
      }"
    `);
  });

  it('generates correct code for array expressions with struct elements', () => {
    const TestStruct = d.struct({
      x: d.u32,
      y: d.f32,
    });

    const testFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      const arr = [TestStruct({ x: 1, y: 2 }), TestStruct({ x: 3, y: 4 })];
      return (arr[1] as { x: number; y: number }).y;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "struct TestStruct {
        x: u32,
        y: f32,
      }

      fn testFn() -> f32 {
        let arr = array<TestStruct, 2>(TestStruct(1u, 2f), TestStruct(3u, 4f));
        return arr[1i].y;
      }"
    `);

    const arraySnippet = extractSnippetFromFn(() => {
      'use gpu';
      const arr = [TestStruct({ x: 1, y: 2 }), TestStruct({ x: 3, y: 4 })];
      return arr;
    });

    expect(d.isWgslArray(arraySnippet.dataType)).toBe(true);
    expect((arraySnippet.dataType as unknown as d.WgslArray).elementCount).toBe(2);
    expect((arraySnippet.dataType as unknown as d.WgslArray).elementType).toBe(TestStruct);
  });

  it('generates correct code for array expressions with lazy elements', () => {
    const testFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      const arr = [lazyV2f.$, std.mul(lazyV2f.$, d.vec2f(2, 2))];
      return (arr[1] as d.v2f).y;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> f32 {
        let arr = array<vec2f, 2>(vec2f(44, 88), vec2f(88, 176));
        return arr[1i].y;
      }"
    `);
  });

  it('allows for member access on values returned from function calls', () => {
    const TestStruct = d.struct({
      x: d.u32,
      y: d.vec3f,
    });

    const fnOne = tgpu.fn(
      [],
      TestStruct,
    )(() => {
      return TestStruct({ x: 1, y: d.vec3f(1, 2, 3) });
    });

    const fnTwo = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return fnOne().y.x;
    });

    expect(tgpu.resolve([fnTwo])).toMatchInlineSnapshot(`
      "struct TestStruct {
        x: u32,
        y: vec3f,
      }

      fn fnOne() -> TestStruct {
        return TestStruct(1u, vec3f(1, 2, 3));
      }

      fn fnTwo() -> f32 {
        return fnOne().y.x;
      }"
    `);

    expectDataTypeOf(() => {
      'use gpu';
      return fnOne().y.x;
    }).toStrictEqual(d.f32);
  });

  it('generates correct code for conditional with single statement', () => {
    const main0 = tgpu.fn(
      [d.bool],
      d.u32,
    )((cond) => {
      if (cond) return 0;
      return 1;
    });

    expect(tgpu.resolve([main0])).toMatchInlineSnapshot(`
      "fn main0(cond: bool) -> u32 {
        if (cond) {
          return 0u;
        }
        return 1u;
      }"
    `);
  });

  it('generates correct code for conditional with else', () => {
    const main1 = tgpu.fn(
      [d.bool],
      d.i32,
    )((cond) => {
      let y = 0;
      if (cond) y = 1;
      else y = 2;
      return y;
    });

    expect(tgpu.resolve([main1])).toMatchInlineSnapshot(`
      "fn main1(cond: bool) -> i32 {
        var y = 0;
        if (cond) {
          y = 1i;
        }
        else {
          y = 2i;
        }
        return y;
      }"
    `);
  });

  it('generates correct code for conditionals block', () => {
    const main2 = tgpu.fn(
      [d.bool],
      d.i32,
    )((cond) => {
      let y = 0;
      if (cond) {
        y = 1;
      } else y = 2;
      return y;
    });

    expect(tgpu.resolve([main2])).toMatchInlineSnapshot(`
      "fn main2(cond: bool) -> i32 {
        var y = 0;
        if (cond) {
          y = 1i;
        }
        else {
          y = 2i;
        }
        return y;
      }"
    `);
  });

  it('generates correct code for while loops with single statements', () => {
    const main = tgpu.fn([])(() => {
      let i = 0;
      while (i < 10) i += 1;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        var i = 0;
        while ((i < 10i)) {
          i += 1i;
        }
      }"
    `);
  });

  it('throws error when incorrectly initializing function', () => {
    const internalTestFn = tgpu.fn(
      [d.vec2f],
      d.mat4x4f,
    )(() => {
      return d.mat4x4f();
    });

    const testFn = tgpu.fn([])(() => {
      // @ts-expect-error
      return internalTestFn([1, 23, 3]);
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn: Cannot convert value of type 'arrayOf(i32, 3)' to any of the target types: [vec2f]]
    `);
  });

  it('throws error when initializing translate4 function', () => {
    const testFn = tgpu.fn(
      [],
      d.mat4x4f,
    )(() => {
      // @ts-expect-error
      return std.translate4();
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn
      - fn:translate4: Cannot read properties of undefined (reading 'x')]
    `);
  });

  it('throws error when initializing vec4f with an array', () => {
    const testFn = tgpu.fn(
      [],
      d.mat4x4f,
    )(() => {
      // @ts-expect-error
      const x = d.vec4f([1, 2, 3, 4]);
      return d.mat4x4f();
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn
      - fn:vec4f: Cannot convert value of type 'arrayOf(i32, 4)' to any of the target types: [f32]]
    `);
  });

  it('generates correct code for pointer value assignment', () => {
    const increment = tgpu.fn([d.ptrFn(d.f32)])((val) => {
      val.$ += 1;
    });

    expect(tgpu.resolve([increment])).toMatchInlineSnapshot(`
      "fn increment(val: ptr<function, f32>) {
        (*val) += 1f;
      }"
    `);
  });

  it('renames variables that would result in invalid WGSL', () => {
    const main = tgpu.fn(
      [],
      d.i32,
    )(() => {
      const notAKeyword = 0;
      const struct = 1;
      return struct;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        const notAKeyword = 0;
        const struct_1 = 1;
        return struct_1;
      }"
    `);
  });

  it('renames items that would result in invalid WGSL', () => {
    const myConst0 = tgpu.const(d.u32, 1).$name('');
    const myConst1 = tgpu.const(d.u32, 1).$name('0');
    const myConst2 = tgpu.const(d.u32, 1).$name('__');
    const myConst3 = tgpu.const(d.u32, 1).$name('struct');

    const main = () => {
      'use gpu';
      const a = myConst0.$;
      const b = myConst1.$;
      const c = myConst2.$;
      const d = myConst3.$;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "const item: u32 = 1u;

      const item_1: u32 = 1u;

      const item_2: u32 = 1u;

      const struct_1: u32 = 1u;

      fn main() {
        const a = item;
        const b = item_1;
        const c = item_2;
        const d = struct_1;
      }"
    `);
  });

  it('throws when struct prop is named wrongly', () => {
    expect(() => tgpu.resolve([d.struct({ '': d.u32 })])).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid property key '': Identifiers cannot be equal to '' or '_']`,
    );
    expect(() => tgpu.resolve([d.struct({ '0': d.u32 })])).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid property key '0': Not compliant with WGSL guidelines.]`,
    );
    expect(() => tgpu.resolve([d.struct({ __: d.u32 })])).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid property key '__': Identifiers cannot start with double underscores.]`,
    );
    expect(() => tgpu.resolve([d.struct({ struct: d.u32 })])).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid property key 'struct': Identifiers cannot start with reserved keywords.]`,
    );
  });

  it('renames parameters that would result in invalid WGSL', () => {
    const main = tgpu.fn(
      [d.i32, d.i32],
      d.i32,
    )((n, macro) => {
      return n + macro;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main(n: i32, macro_1: i32) -> i32 {
        return (n + macro_1);
      }"
    `);
  });

  it('assigns a different name when an identifier starts with underscores', () => {
    const main1 = tgpu.fn([])(() => {
      const _ = 1;
    });

    const main2 = tgpu.fn([])(() => {
      const __my_var = 2;
    });

    expect(tgpu.resolve([main1])).toMatchInlineSnapshot(`
      "fn main1() {
        const item = 1;
      }"
    `);
    expect(tgpu.resolve([main2])).toMatchInlineSnapshot(`
      "fn main2() {
        const item = 2;
      }"
    `);
  });

  it('does not cause identifier clashes when renaming variables', () => {
    const main = tgpu.fn([])(() => {
      const mut = 1;
      const mut_1 = 2;
      const mut_1_2 = 2;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        const mut_1 = 1;
        const mut_1_1 = 2;
        const mut_1_2 = 2;
      }"
    `);
  });

  it('does not cause identifier clashes when renaming parameters', () => {
    const main = tgpu.fn([d.u32, d.u32])((extern, extern_1) => {});

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main(extern_1: u32, extern_1_1: u32) {

      }"
    `);
  });

  it('generates correct code for pow expression', () => {
    const power = tgpu.fn([])(() => {
      const a = d.f32(10);
      const b = d.f32(3);
      const n = a ** b;
    });

    expect(tgpu.resolve([power])).toMatchInlineSnapshot(`
      "fn power() {
        const a = 10f;
        const b = 3f;
        let n = pow(a, b);
      }"
    `);
  });

  it('calculates pow at comptime when possible', () => {
    const four = 4;
    const power = tgpu.fn([])(() => {
      const n = 2 ** four;
    });

    expect(tgpu.resolve([power])).toMatchInlineSnapshot(`
      "fn power() {
        const n = 16.;
      }"
    `);
  });

  it('casts in pow expression when necessary', () => {
    const power = tgpu.fn([])(() => {
      const a = d.u32(3);
      const b = d.i32(5);
      const m = a ** b;
    });

    expect(tgpu.resolve([power])).toMatchInlineSnapshot(`
      "fn power() {
        const a = 3u;
        const b = 5i;
        let m = pow(f32(a), f32(b));
      }"
    `);
  });

  it('throws error when accessing matrix elements directly', () => {
    const testFn = tgpu.fn([])(() => {
      const matrix = d.mat4x4f();
      const element = matrix[4];
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn: The only way of accessing matrix elements in TypeGPU functions is through the 'columns' property.]
    `);
  });

  it('generates correct code when accessing matrix elements through .columns', () => {
    const testFn = tgpu.fn([])(() => {
      const matrix = d.mat4x4f();
      const column = matrix.columns[1];
      const element = column[0];
      const directElement = matrix.columns[1][0];
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        var matrix = mat4x4f(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        let column = (&matrix[1i]);
        let element = (*column)[0i];
        let directElement = matrix[1i][0i];
      }"
    `);
  });

  it('resolves when accessing matrix elements through .columns', () => {
    const matrix = tgpu.workgroupVar(d.mat4x4f);
    const index = tgpu.workgroupVar(d.u32);

    const testFn = tgpu.fn([])(() => {
      const element = matrix.$.columns[index.$];
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "var<workgroup> matrix: mat4x4f;

      var<workgroup> index: u32;

      fn testFn() {
        let element = (&matrix[index]);
      }"
    `);
  });

  it('throws a descriptive error when accessing an external array with a runtime known index', () => {
    const myArray = [9, 8, 7, 6];

    const testFn = tgpu.fn(
      [d.u32],
      d.u32,
    )((i) => {
      return myArray[i] as number;
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn: Index access 'myArray[i]' is invalid. If the value is an array, to address this, consider one of the following approaches: (1) declare the array using 'tgpu.const', (2) store the array in a buffer, or (3) define the array within the GPU function scope.]
    `);
  });

  it('throws a descriptive error when calling a function with too many arguments', () => {
    const testFn = tgpu.fn([])(() => {});
    const main = () => {
      'use gpu';
      // @ts-ignore
      testFn(1, 2);
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Call 'testFn(1, 2)' is invalid since the function expected fewer arguments]
    `);
  });

  it('throws a descriptive error when creating a non-uniform array', () => {
    const testFn = () => {
      'use gpu';
      const t = [1, 2, d.vec2u()];
    };

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:testFn
      - fn*:testFn(): Values '[1, 2, d.vec2u()]' cannot be automatically converted to a common type. Consider wrapping the array in an appropriate schema]
    `);
  });

  it('throws a descriptive error when returning a reference', ({ root }) => {
    const myUniform = root.createUniform(d.vec3u);
    const testFn = () => {
      'use gpu';
      const v = myUniform.$;
      return v;
    };

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:testFn
      - fn*:testFn(): 'return v;' is invalid, cannot return references.
      -----
      Try 'return vec3u(v);' instead.
      -----]
    `);
  });

  it('throws a descriptive error when declaring a variable without initializer', () => {
    const testFn = () => {
      'use gpu';
      // oxlint-disable-next-line typegpu/no-uninitialized-variables
      let a;
    };

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:testFn
      - fn*:testFn(): 'let a;' is invalid because all variables need initializers.]
    `);
  });

  it('throws a descriptive error when declaring a loose variable', () => {
    const Unstruct = d.unstruct({ prop: d.vec4f });
    const testFn = () => {
      'use gpu';
      let a = Unstruct();
    };

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:testFn
      - fn*:testFn(): Function 'Unstruct' is not marked with the 'use gpu' directive and cannot be used in a shader]
    `);
  });

  it('throws a descriptive error when declaring a const inside TGSL', () => {
    const testFn = tgpu.fn(
      [d.u32],
      d.u32,
    )((i) => {
      const myArray = tgpu.const(d.arrayOf(d.u32, 4), [9, 8, 7, 6]);
      return myArray.$[i] as number;
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn: Constants cannot be defined within TypeGPU function scope. To address this, move the constant definition outside the function scope.]
    `);
  });

  it('generates correct indentation for nested blocks', () => {
    const main = tgpu.fn(
      [],
      d.i32,
    )(() => {
      let res = 0;
      {
        const f = 2;
        res += f;
      }
      return res;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        var res = 0;
        {
          const f = 2;
          res += f;
        }
        return res;
      }"
    `);
  });

  it('block externals do not override identifiers', () => {
    const f = () => {
      'use gpu';
      const list = [1];
      for (const x of tgpu.unroll(list)) {
        const y = 100;
        const x = y;
        return x;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        var list = array<i32, 1>(1);
        // unrolled iteration #0
        {
          const y = 100;
          let x = y;
          return x;
        }
      }"
    `);
  });

  it('block externals are injected correctly', () => {
    const f = () => {
      'use gpu';
      for (const x of tgpu.unroll([1])) {
        const y = x;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        // unrolled iteration #0
        {
          const y = 1;
        }
      }"
    `);
  });

  it('block externals are respected in nested blocks', () => {
    const f = () => {
      'use gpu';
      let result = d.i32(0);
      const list = [1];
      for (const elem of tgpu.unroll(list)) {
        {
          // We use the `elem` in a nested block
          result += elem;
        }
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var result = 0i;
        var list = array<i32, 1>(1);
        // unrolled iteration #0
        {
          {
            result += list[0u];
          }
        }
      }"
    `);
  });

  it('prunes comptime if/else', () => {
    const vAccess = tgpu.accessor(d.u32);

    const fn = tgpu.fn(() => {
      'use gpu';
      let a = -1;
      if (vAccess.$ === 0) {
        const temp = 0;
        a = temp;
      } else {
        const temp = 1;
        a = temp;
      }
      const temp = a * 2;
      return temp;
    });

    expect(tgpu.resolve([fn.with(vAccess, 0)])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        var a = -1;
        {
          const temp = 0;
          a = temp;
        }
        let temp = (a * 2i);
        return temp;
      }"
    `);

    expect(tgpu.resolve([fn.with(vAccess, 1)])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        var a = -1;
        {
          const temp = 1;
          a = temp;
        }
        let temp = (a * 2i);
        return temp;
      }"
    `);

    expect(
      tgpu.resolve([
        fn.with(vAccess, () => {
          'use gpu';
          return 0;
        }),
      ]),
    ).toMatchInlineSnapshot(`
      "fn item() -> i32 {
        return 0;
      }

      fn fn_1() -> i32 {
        var a = -1;
        if ((item() == 0u)) {
          const temp = 0;
          a = temp;
        }
        else {
          const temp = 1;
          a = temp;
        }
        let temp = (a * 2i);
        return temp;
      }"
    `);
  });

  it('prunes comptime if/else without blocks', () => {
    const vAccess = tgpu.accessor(d.u32);

    const fn = tgpu.fn(() => {
      'use gpu';
      let a = -1;
      if (vAccess.$ === 0) a = 0;
      else a = 1;
      return a;
    });

    expect(tgpu.resolve([fn.with(vAccess, 0)])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        var a = -1;
        {
          a = 0i;
        }
        return a;
      }"
    `);

    expect(tgpu.resolve([fn.with(vAccess, 1)])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        var a = -1;
        {
          a = 1i;
        }
        return a;
      }"
    `);

    expect(
      tgpu.resolve([
        fn.with(vAccess, () => {
          'use gpu';
          return 0;
        }),
      ]),
    ).toMatchInlineSnapshot(`
      "fn item() -> i32 {
        return 0;
      }

      fn fn_1() -> i32 {
        var a = -1;
        if ((item() == 0u)) {
          a = 0i;
        }
        else {
          a = 1i;
        }
        return a;
      }"
    `);
  });

  it('dedents nested comptime if/else', () => {
    const v = 2 as number;

    const fn = () => {
      'use gpu';
      let a = -1;
      if (v === 0) {
        a = 0;
      } else {
        if (v === 1) {
          a = 1;
        } else {
          a = 2;
        }
      }
      return a;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        var a = -1;
        {
          a = 2i;
        }
        return a;
      }"
    `);
  });

  it('dedents nested comptime if/else without else blocks', () => {
    const v = 2 as number;

    const fn = () => {
      'use gpu';
      let a = -1;
      if (v === 0) {
        a = 0;
      } else if (v === 1) {
        a = 1;
      } else {
        a = 2;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var a = -1;
        {
          a = 2i;
        }
      }"
    `);
  });

  it('prunes inequalities if comptime known (>=)', () => {
    const renderAspect = 1.5;

    const fn = () => {
      'use gpu';
      let rayDir = d.vec2f();

      if (renderAspect >= 1) {
        rayDir = d.vec2f(1, 0);
      } else {
        rayDir = d.vec2f(0, 1);
      }

      if (renderAspect < 0) {
        return d.vec2f(-1, -1);
      }

      return rayDir;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> vec2f {
        var rayDir = vec2f();
        {
          rayDir = vec2f(1, 0);
        }
        return rayDir;
      }"
    `);
  });

  it('dedents multinested comptime if/else without else blocks', () => {
    const v = 3 as number;

    const fn = () => {
      'use gpu';
      let a = -1;
      if (v === 0) {
        a = 0;
      } else if (v === 1) {
        a = 1;
      } else if (v === 2) {
        a = 2;
      } else if (v === 3) {
        a = 3;
      } else if (v === 4) {
        a = 4;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var a = -1;
        {
          a = 3i;
        }
      }"
    `);
  });

  it('handles unary operator `!` on boolean runtime-known operand', () => {
    const testFn = tgpu.fn(
      [d.bool],
      d.bool,
    )((b) => {
      return !b;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
        "fn testFn(b: bool) -> bool {
          return !b;
        }"
      `);
  });

  it('handles unary operator `!` on numeric runtime-known operand', () => {
    const testFn = tgpu.fn(
      [d.i32],
      d.bool,
    )((n) => {
      return !n;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
        "fn testFn(n: i32) -> bool {
          return !bool(n);
        }"
      `);
  });

  it('handles unary operator `!` on non-primitive values', ({ root }) => {
    const buffer = root.createUniform(d.mat4x4f);
    const testFn = tgpu.fn([d.vec3f, d.atomic(d.u32), d.ptrPrivate(d.u32)])((v, a, p) => {
      const _b0 = !buffer;
      const _b1 = !buffer.$;
      const _b2 = !v;
      const _b3 = !a;
      const _b4 = !std.atomicLoad(a);
      const _b5 = !p;
      const _b6 = !p.$;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> buffer: mat4x4f;

      fn testFn(v: vec3f, a: atomic<u32>, p: ptr<private, u32>) {
        const _b0 = false;
        const _b1 = false;
        const _b2 = false;
        const _b3 = false;
        let _b4 = !bool(atomicLoad(&a));
        const _b5 = false;
        let _b6 = !bool((*p));
      }"
    `);
  });

  it('handles unary operator `!` on numeric and boolean comptime-known operands', () => {
    const getN = tgpu.comptime(() => 1882);

    const f = () => {
      'use gpu';
      if (!(getN() === 7) || !getN()) {
        return 1;
      }
      return -1;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        {
          return 1;
        }
        return -1;
      }"
    `);
  });

  it('handles unary operator `!` on operands from slots and accessors', () => {
    const Boid = d.struct({
      pos: d.vec2f,
      vel: d.vec2f,
    });

    const slot = tgpu.slot<d.Infer<typeof Boid>>({ pos: d.vec2f(), vel: d.vec2f() });
    const accessor = tgpu.accessor(d.vec4u, d.vec4u(1, 8, 8, 2));

    const f = () => {
      'use gpu';
      if (!!slot.$ && !!accessor.$) {
        return 1;
      }
      return -1;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        {
          return 1;
        }
        return -1;
      }"
    `);
  });

  it('handles chained unary operators `!`', () => {
    const testFn = tgpu.fn(
      [d.i32],
      d.bool,
    )((n) => {
      // oxlint-disable-next-line
      return !!!!!false || !!!n;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn(n: i32) -> bool {
        return true;
      }"
    `);
  });

  it('throws a readable error when assigning an argument reference', () => {
    const testFn = tgpu.fn([d.vec3u])((v) => {
      let u = d.vec3u();
      u = v;
    });

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn: 'u = v' is invalid, because references cannot be assigned.
      -----
      Try 'u = vec3u(v)' to copy the value instead.
      -----]
    `);
  });

  it('throws a readable error when assigning a reference', () => {
    const testFn = () => {
      'use gpu';
      let u = d.vec3u();
      const v = d.vec3u();
      u = v;
    };

    expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:testFn
      - fn*:testFn(): 'u = v' is invalid, because references cannot be assigned.
      -----
      Try 'u = vec3u(v)' to copy the value instead.
      -----]
    `);
  });

  it('handles unary operator `!` on complex comptime-known operand', () => {
    const slot = tgpu.slot<{ a?: number }>({});

    const f = () => {
      'use gpu';
      // oxlint-disable-next-line
      if (!!slot.$.a) {
        return slot.$.a;
      }
      return 1929;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f() -> i32 {
          return 1929;
        }"
      `);
  });

  it('throws a readable error on update as expression', () => {
    const fn = () => {
      'use gpu';
      let a = 1;
      const b = a++;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): 'a++' is invalid because update is only allowed as a statement.]
    `);
  });

  it('throws a readable error when encountering NaN or Infinity', () => {
    const fn1 = tgpu.fn([])(() => {
      'use gpu';
      const n = Infinity;
    });

    const fn2 = tgpu.fn([])(() => {
      'use gpu';
      const n = 1 / 0;
    });

    const fn3 = tgpu.fn([])(() => {
      'use gpu';
      const n = std.div(0, 0);
    });

    expect(() => tgpu.resolve([fn1])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn1: Value 'Infinity' (abstractFloat) cannot be resolved due to WGSL's Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption). This value might be a result of a comptime-evaluated operation.]
    `);

    expect(() => tgpu.resolve([fn2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn2: Value 'Infinity' (abstractFloat) cannot be resolved due to WGSL's Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption). This value might be a result of a comptime-evaluated operation.]
    `);

    expect(() => tgpu.resolve([fn3])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn3: Value 'NaN' (abstractFloat) cannot be resolved due to WGSL's Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption). This value might be a result of a comptime-evaluated operation.]
    `);
  });
});

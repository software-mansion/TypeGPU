import { attest } from '@ark/attest';
import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { readData, writeData } from '../src/data/dataIO.ts';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { StrictNameRegistry } from '../src/nameRegistry.ts';
import { resolve } from '../src/resolutionCtx.ts';
import type { Infer } from '../src/shared/repr.ts';
import { arrayLength } from '../src/std/array.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('array', () => {
  it('produces a visually pleasant type', () => {
    const TestArray = d.arrayOf(d.vec3u, 3);
    attest(TestArray).type.toString.snap('WgslArray<Vec3u>');
  });

  it('takes element alignment into account when measuring', () => {
    const TestArray = d.arrayOf(d.vec3u, 3);
    expect(d.sizeOf(TestArray)).toBe(48);
  });

  it('aligns array elements when writing', () => {
    const TestArray = d.arrayOf(d.vec3u, 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const writer = new BufferWriter(buffer);

    writeData(writer, TestArray, [
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
    // deno-fmt-ignore
    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  });

  it('aligns array elements when reading', () => {
    const TestArray = d.arrayOf(d.vec3u, 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readData(reader, TestArray)).toStrictEqual([
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
  });

  it('encodes and decodes arrays properly', () => {
    const TestArray = d.arrayOf(d.vec3f, 5);

    const buffer = new ArrayBuffer(d.sizeOf(TestArray));

    const value: Infer<typeof TestArray> = [
      d.vec3f(1.5, 2, 3.5),
      d.vec3f(),
      d.vec3f(-1.5, 2, 3.5),
      d.vec3f(1.5, -2, 3.5),
      d.vec3f(1.5, 2, 15),
    ];

    writeData(new BufferWriter(buffer), TestArray, value);
    expect(readData(new BufferReader(buffer), TestArray)).toStrictEqual(value);
  });

  it('throws when trying to read/write a runtime-sized array', () => {
    const TestArray = d.arrayOf(d.vec3f, 0);

    expect(d.sizeOf(TestArray)).toBeNaN();

    expect(() =>
      writeData(new BufferWriter(new ArrayBuffer(0)), TestArray, [
        d.vec3f(),
        d.vec3f(),
      ])
    ).toThrow();

    expect(() => readData(new BufferReader(new ArrayBuffer(0)), TestArray))
      .toThrow();

    const opts = { names: new StrictNameRegistry() };

    expect(resolve(TestArray, opts).code).toContain('array<vec3f>');
  });

  it('throws when trying to nest runtime sized arrays', () => {
    expect(() => d.arrayOf(d.arrayOf(d.vec3f, 0), 0)).toThrow();
  });

  it('can be called to create an array', () => {
    const ArraySchema = d.arrayOf(d.u32, 4);

    const obj = ArraySchema([1, 2, 3, 4]);

    expect(obj).toStrictEqual([1, 2, 3, 4]);
    expectTypeOf(obj).toEqualTypeOf<number[]>();
  });

  it('cannot be called with invalid properties', () => {
    const ArraySchema = d.arrayOf(d.u32, 4);

    // @ts-expect-error
    (() => ArraySchema([1, 2, 3, d.vec3f()]));
    // @ts-expect-error
    (() => ArraySchema([d.vec3f(), d.vec3f(), d.vec3f(), d.vec3f()]));
  });

  it('can be called to create a deep copy of other array', () => {
    const InnerSchema = d.arrayOf(d.vec3f, 2);
    const OuterSchema = d.arrayOf(InnerSchema, 3);
    const instance = OuterSchema([
      InnerSchema([d.vec3f(1, 2, 3), d.vec3f()]),
      InnerSchema([d.vec3f(), d.vec3f()]),
      InnerSchema([d.vec3f(), d.vec3f()]),
    ]);

    const clone = OuterSchema(instance);

    expect(clone).toStrictEqual(instance);
    expect(clone).not.toBe(instance);
    expect(clone[0]).not.toBe(instance[0]);
    expect(clone[0]).not.toBe(clone[1]);
    expect(clone[0]?.[0]).not.toBe(instance[0]?.[0]);
    expect(clone[0]?.[0]).toStrictEqual(d.vec3f(1, 2, 3));
  });

  it('throws when invalid number of arguments', () => {
    const ArraySchema = d.arrayOf(d.u32, 2);

    expect(() => ArraySchema([1])).toThrowErrorMatchingInlineSnapshot(
      '[Error: Array schema of 2 elements of type u32 called with 1 arguments.]',
    );
    expect(() => ArraySchema([1, 2, 3])).toThrowErrorMatchingInlineSnapshot(
      '[Error: Array schema of 2 elements of type u32 called with 3 arguments.]',
    );
  });

  it('can be called to create a default value', () => {
    const ArraySchema = d.arrayOf(d.vec3f, 2);

    const defaultArray = ArraySchema();

    expect(defaultArray).toStrictEqual([d.vec3f(), d.vec3f()]);
  });

  it('can be called to create a default value with nested struct', () => {
    const StructSchema = d.struct({ vec: d.vec3f });
    const ArraySchema = d.arrayOf(StructSchema, 2);

    const defaultArray = ArraySchema();

    expect(defaultArray).toStrictEqual([
      { vec: d.vec3f() },
      { vec: d.vec3f() },
    ]);
  });

  it('generates correct code when Array default constructor is used', () => {
    const Nested = d.arrayOf(d.f32, 1);
    const Outer = d.arrayOf(Nested, 2);

    const testFunction = tgpu.fn([])(() => {
      const defaultValue = Outer();
    });

    expect(parseResolved({ testFunction })).toBe(parse(`
      fn testFunction() {
        var defaultValue = array<array<f32, 1>, 2>();
      }`));
  });

  it('generates correct code when array clone is used', () => {
    const ArraySchema = d.arrayOf(d.u32, 1);

    const testFn = tgpu.fn([])(() => {
      const myArray = ArraySchema([d.u32(10)]);
      const myClone = ArraySchema(myArray);
      return;
    });

    expect(parseResolved({ testFn })).toBe(parse(`
      fn testFn() {
        var myArray = array<u32, 1>(u32(10));
        var myClone = myArray;
        return;
      }`));
  });

  it('generates correct code when complex array clone is used', () => {
    const ArraySchema = d.arrayOf(d.i32, 1);

    const testFn = tgpu.fn([])(() => {
      const myArrays = [ArraySchema([10])] as const;
      const myClone = ArraySchema(myArrays[0]);
      return;
    });

    expect(parseResolved({ testFn })).toBe(
      parse(`
          fn testFn() {
            var myArrays = array<array<i32, 1>, 1>(array<i32, 1>(10));
            var myClone = myArrays[0];
            return;
          }`),
    );
  });
});

describe('array.length', () => {
  it('works for dynamically-sized arrays in TGSL', () => {
    const layout = tgpu.bindGroupLayout({
      values: {
        storage: (n: number) => d.arrayOf(d.f32, n),
        access: 'mutable',
      },
    });

    const foo = tgpu.fn([])(() => {
      let acc = d.f32(1);
      for (let i = d.u32(0); i < layout.bound.values.value.length; i++) {
        layout.bound.values.value[i] = acc;
        acc *= 2;
      }
    });

    expect(parseResolved({ foo })).toBe(
      parse(/* wgsl */ `
        @group(0) @binding(0) var <storage, read_write> values: array<f32>;

        fn foo() {
          var acc = f32(1);
          for (var i = u32(0); (i < arrayLength(&values)); i++) {
            values[i] = acc;
            acc *= 2;
          }
        }
      `),
    );
  });

  it('works for statically-sized arrays in TGSL', () => {
    const layout = tgpu.bindGroupLayout({
      values: {
        storage: d.arrayOf(d.f32, 128),
        access: 'mutable',
      },
    });

    const foo = tgpu.fn([])(() => {
      let acc = d.f32(1);
      for (let i = 0; i < layout.bound.values.value.length; i++) {
        layout.bound.values.value[i] = acc;
        acc *= 2;
      }
    });

    expect(parseResolved({ foo })).toBe(
      parse(/* wgsl */ `
        @group(0) @binding(0) var <storage, read_write> values: array<f32, 128>;

        fn foo() {
          var acc = f32(1);
          for (var i = 0; (i < 128); i++) {
            values[i] = acc;
            acc *= 2;
          }
        }
      `),
    );
  });

  describe('arrayLength', () => {
    it('returns the length of a static array', () => {
      const staticArray = d.arrayOf(d.f32, 5);
      const layout = tgpu.bindGroupLayout({
        values: {
          storage: staticArray,
          access: 'mutable',
        },
      });

      const testFn = tgpu.fn([], d.i32)(() => {
        return arrayLength(layout.$.values);
      });

      expect(parseResolved({ testFn })).toBe(
        parse(/* wgsl */ `
          @group(0) @binding(0) var<storage, read_write> values: array<f32, 5>;
  
          fn testFn() -> i32 {
            return 5;
          }
        `),
      );
    });

    it('returns the length of a dynamic array', () => {
      const dynamicArray = d.arrayOf(d.f32, 0);
      const layout = tgpu.bindGroupLayout({
        values: {
          storage: dynamicArray,
          access: 'mutable',
        },
      });

      const testFn = tgpu.fn([], d.u32)(() => {
        return arrayLength(layout.bound.values.value);
      });

      expect(parseResolved({ testFn })).toBe(
        parse(/* wgsl */ `
          @group(0) @binding(0) var<storage, read_write> values: array<f32>;
  
          fn testFn() -> u32 {
            return arrayLength(&values);
          }
        `),
      );
    });
  });
});

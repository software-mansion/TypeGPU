import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import tgpu from '../src';
import * as d from '../src/data';
import { readData, writeData } from '../src/data/dataIO';
import { StrictNameRegistry } from '../src/nameRegistry';
import { resolve } from '../src/resolutionCtx';
import type { Infer } from '../src/shared/repr';
import { parse, parseResolved } from './utils/parseResolved';

describe('array', () => {
  it('takes element alignment into account when measuring', () => {
    const TestArray = d.arrayOf(d.vec3u, 3);
    expect(d.sizeOf(TestArray)).toEqual(48);
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
    expect([...new Uint32Array(buffer)]).toEqual([
      1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0,
    ]);
  });

  it('aligns array elements when reading', () => {
    const TestArray = d.arrayOf(d.vec3u, 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readData(reader, TestArray)).toEqual([
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
    expect(readData(new BufferReader(buffer), TestArray)).toEqual(value);
  });

  it('throws when trying to read/write a runtime-sized array', () => {
    const TestArray = d.arrayOf(d.vec3f, 0);

    expect(d.sizeOf(TestArray)).toBeNaN();

    expect(() =>
      writeData(new BufferWriter(new ArrayBuffer(0)), TestArray, [
        d.vec3f(),
        d.vec3f(),
      ]),
    ).toThrow();

    expect(() =>
      readData(new BufferReader(new ArrayBuffer(0)), TestArray),
    ).toThrow();

    const opts = { names: new StrictNameRegistry() };

    expect(resolve(TestArray, opts).code).toContain('array<vec3f>');
  });

  it('throws when trying to nest runtime sized arrays', () => {
    expect(() => d.arrayOf(d.arrayOf(d.vec3f, 0), 0)).toThrow();
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

    const foo = tgpu['~unstable'].fn([]).does(() => {
      let acc = d.f32(1);
      for (let i = 0; i < layout.bound.values.value.length; i++) {
        layout.bound.values.value[i] = acc;
        acc *= 2;
      }
    });

    expect(parseResolved({ foo })).toEqual(
      parse(/* wgsl */ `
        @group(0) @binding(0) var <storage, read_write> values: array<f32>;

        fn foo() {
          var acc = f32(1);
          for (var i = 0; (i < arrayLength(&values)); i++) {
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

    const foo = tgpu['~unstable'].fn([]).does(() => {
      let acc = d.f32(1);
      for (let i = 0; i < layout.bound.values.value.length; i++) {
        layout.bound.values.value[i] = acc;
        acc *= 2;
      }
    });

    expect(parseResolved({ foo })).toEqual(
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
});

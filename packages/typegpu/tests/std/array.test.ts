import { describe, expect, it } from 'vitest';
import * as d from '../../src/data/index.ts';
import { parse, parseResolved } from '../utils/parseResolved.ts';
import { arrayLength } from '../../src/std/array.ts';
import { tgpu } from '../../src/index.ts';

describe('arrayLength', () => {
  it('returns the length of a static array', () => {
    const staticArray = d.arrayOf(d.f32, 5);
    const layout = tgpu.bindGroupLayout({
      values: {
        storage: staticArray,
        access: 'readonly',
      },
    });

    const testFn = tgpu['~unstable'].fn(
      [],
      d.i32,
    )(() => {
      if (!layout.bound.values) {
        throw new Error('layout.bound.values is undefined');
      }
      return arrayLength(layout.bound.values.value);
    });

    expect(parseResolved({ testFn })).toBe(
      parse(/* wgsl */ `
        @group(0) @binding(0) var<storage, read> values: array<f32, 5>;

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
        access: 'readonly',
      },
    });

    const testFn = tgpu['~unstable'].fn(
      [],
      d.u32,
    )(() => {
      if (!layout.bound.values) {
        throw new Error('layout.bound.values is undefined');
      }
      return arrayLength(layout.bound.values.value);
    });

    expect(parseResolved({ testFn })).toBe(
      parse(/* wgsl */ `
        @group(0) @binding(0) var<storage, read> values: array<f32>;

        fn testFn() -> u32 {
          return arrayLength(&values);
        }
      `),
    );
  });
});

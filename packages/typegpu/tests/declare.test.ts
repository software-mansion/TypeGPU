import { parse } from '@typegpu/wgsl-parser';
import { describe, expect, it } from 'vitest';
import * as d from '../src/data';
import tgpu from '../src/experimental';
import { parseResolved } from './utils/parseResolved';

describe('tgpu.declare', () => {
  it('should inject provided declaration when resolving a function', () => {
    const declaration = tgpu.declare(
      '@group(0) @binding(0) var<uniform> val: f32;',
    );

    const fn = tgpu
      .fn([])
      .does(`() {
        // do nothing
      }`)
      .$uses({ declaration })
      .$name('empty');

    expect(parseResolved(fn)).toEqual(
      parse(`
      @group(0) @binding(0) var<uniform> val: f32;

      fn empty() {}
    `),
    );
  });

  it('should replace declaration statement in raw wgsl', () => {
    const declaration = tgpu.declare(
      '@group(0) @binding(0) var<uniform> val: f32;',
    );

    const fn = tgpu
      .fn([])
      .does(`() {
        declaration
        // do nothing
      }`)
      .$uses({ declaration })
      .$name('empty');

    expect(parseResolved(fn)).toEqual(
      parse(`
      @group(0) @binding(0) var<uniform> val: f32;

      fn empty() {}
    `),
    );
  });

  it('should inject all provided declarations', () => {
    const fn = tgpu
      .fn([])
      .does(`() {
        // do nothing
      }`)
      .$uses({
        extraDeclaration1: tgpu.declare(
          '@group(0) @binding(0) var<uniform> val: f32;',
        ),
        extraDeclaration2: tgpu.declare(`
          struct Output { 
            x: u32,
          }`),
      })
      .$name('empty');

    expect(parseResolved(fn)).toEqual(
      parse(`
      @group(0) @binding(0) var<uniform> val: f32;

      struct Output { 
        x: u32,
      }

      fn empty() {}
    `),
    );
  });

  it('should replace nested declarations', () => {
    const declaration = tgpu
      .declare('@group(0) @binding(0) var<uniform> val: f32;')
      .$uses({
        nestedDeclaration: tgpu.declare(
          `struct Output { 
              x: u32,
            }`,
        ),
      });

    const fn = tgpu
      .fn([])
      .does(`() {
        // do nothing
      }`)
      .$uses({ declaration })
      .$name('empty');

    expect(parseResolved(fn)).toEqual(
      parse(`
        struct Output { 
          x: u32,
        }

        @group(0) @binding(0) var<uniform> val: f32;
  
        fn empty() {}
      `),
    );
  });

  it('should resolve declaration with its own externals', () => {
    const Output = d.struct({
      x: d.u32,
    });

    const declaration = tgpu
      .declare('@group(0) @binding(0) var<uniform> val: Output;')
      .$uses({ Output });

    const fn = tgpu
      .fn([])
      .does(`() {
        // do nothing
      }`)
      .$uses({ declaration })
      .$name('empty');

    expect(parseResolved(fn)).toEqual(
      parse(`
        struct Output { 
          x: u32,
        }

        @group(0) @binding(0) var<uniform> val: Output;
  
        fn empty() {}
      `),
    );
  });

  it('works with tgsl functions', () => {
    const declaration = tgpu.declare(
      '@group(0) @binding(0) var<uniform> val: f32;',
    );

    const main = tgpu
      .fn([], d.f32)
      .does(() => {
        declaration;
        return 2;
      })
      .$name('main');

    expect(parseResolved(main)).toEqual(
      parse(`
      @group(0) @binding(0) var<uniform> val: f32;

      fn main() -> f32 {
        ;
        return 2;
      }
    `),
    );
  });
});

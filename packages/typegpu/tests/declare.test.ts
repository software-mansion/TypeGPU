import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, it } from 'vitest';
import { declare } from '../src/core/declare/tgpuDeclare';
import { fn } from '../src/core/function/tgpuFn';
import * as d from '../src/data';
import { parseResolved } from './utils/parseResolved';

describe('tgpu.declare', () => {
  it('should inject provided declaration when resolving a function', () => {
    const declaration = declare('@group(0) @binding(0) var<uniform> val: f32;');

    const fn_1 = fn([])
      .does(`() {
        // do nothing
      }`)
      .$uses({ declaration })
      .$name('empty');

    expect(parseResolved({ fn: fn_1 })).toEqual(
      parse(`
      @group(0) @binding(0) var<uniform> val: f32;

      fn empty() {}
    `),
    );
  });

  it('should replace declaration statement in raw wgsl', () => {
    const declaration = declare('@group(0) @binding(0) var<uniform> val: f32;');

    const fn_1 = fn([])
      .does(`() {
        declaration
        // do nothing
      }`)
      .$uses({ declaration })
      .$name('empty');

    expect(parseResolved({ fn: fn_1 })).toEqual(
      parse(`
      @group(0) @binding(0) var<uniform> val: f32;

      fn empty() {}
    `),
    );
  });

  it('should inject all provided declarations', () => {
    const fn_1 = fn([])
      .does(`() {
        // do nothing
      }`)
      .$uses({
        extraDeclaration1: declare(
          '@group(0) @binding(0) var<uniform> val: f32;',
        ),
        extraDeclaration2: declare(`
          struct Output {
            x: u32,
          }`),
      })
      .$name('empty');

    expect(parseResolved({ fn: fn_1 })).toEqual(
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
    const declaration = declare(
      '@group(0) @binding(0) var<uniform> val: f32;',
    ).$uses({
      nestedDeclaration: declare(
        `struct Output {
              x: u32,
            }`,
      ),
    });

    const fn_1 = fn([])
      .does(`() {
        // do nothing
      }`)
      .$uses({ declaration })
      .$name('empty');

    expect(parseResolved({ fn: fn_1 })).toEqual(
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

    const declaration = declare(
      '@group(0) @binding(0) var<uniform> val: Output;',
    ).$uses({ Output });

    const fn_1 = fn([])
      .does(`() {
        // do nothing
      }`)
      .$uses({ declaration })
      .$name('empty');

    expect(parseResolved({ fn: fn_1 })).toEqual(
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
    const declaration = declare('@group(0) @binding(0) var<uniform> val: f32;');

    const main = fn([], d.f32)
      .does(() => {
        declaration;
        return 2;
      })
      .$name('main');

    expect(parseResolved({ main })).toEqual(
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

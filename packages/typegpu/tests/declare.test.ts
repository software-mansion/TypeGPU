import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('tgpu.declare', () => {
  it('should inject provided declaration when resolving a function', () => {
    const declaration = tgpu['~unstable'].declare(
      '@group(0) @binding(0) var<uniform> val: f32;',
    );

    const empty = tgpu.fn([])(`() {
        // do nothing
      }`)
      .$uses({ declaration });

    expect(parseResolved({ empty })).toBe(
      parse(`
      @group(0) @binding(0) var<uniform> val: f32;

      fn empty() {}
    `),
    );
  });

  it('should replace declaration statement in raw wgsl', () => {
    const declaration = tgpu['~unstable'].declare(
      '@group(0) @binding(0) var<uniform> val: f32;',
    );

    const empty = tgpu
      .fn([])(`() {
        declaration
        // do nothing
      }`)
      .$uses({ declaration });

    expect(parseResolved({ empty })).toBe(
      parse(`
      @group(0) @binding(0) var<uniform> val: f32;

      fn empty() {}
    `),
    );
  });

  it('should inject all provided declarations', () => {
    const decl1 = tgpu['~unstable'].declare(
      '@group(0) @binding(0) var<uniform> val: f32;',
    );
    const decl2 = tgpu['~unstable'].declare(`
      struct Output {
        x: u32,
      }`);

    const empty = tgpu.fn([])(`() {
        // do nothing
      }`)
      .$uses({ decl1, decl2 });

    expect(parseResolved({ empty })).toBe(
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
    const declaration = tgpu['~unstable']
      .declare('@group(0) @binding(0) var<uniform> val: f32;')
      .$uses({
        nested: tgpu['~unstable'].declare(
          `struct Output {
              x: u32,
            }`,
        ),
      });

    const empty = tgpu.fn([])(`() {
        // do nothing
      }`)
      .$uses({ declaration });

    expect(parseResolved({ empty })).toBe(
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

    const declaration = tgpu['~unstable']
      .declare('@group(0) @binding(0) var<uniform> val: Output;')
      .$uses({ Output });

    const empty = tgpu.fn([])(`() {
        // do nothing
      }`)
      .$uses({ declaration });

    expect(parseResolved({ empty })).toBe(
      parse(`
        struct Output {
          x: u32,
        }

        @group(0) @binding(0) var<uniform> val: Output;

        fn empty() {}
      `),
    );
  });

  it('works with TGSL functions', () => {
    const declaration = tgpu['~unstable'].declare(
      '@group(0) @binding(0) var<uniform> val: f32;',
    );

    const main = tgpu.fn([], d.f32)(() => {
      declaration;
      return 2;
    });

    expect(parseResolved({ main })).toBe(
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

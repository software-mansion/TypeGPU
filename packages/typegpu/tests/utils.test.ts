import { describe, expect, it } from 'vitest';
import { extractArgs } from '../src/utils';

// for better formatting and less boilerplate
function createArg(
  identifier: string,
  attributes: string[],
  type: string | undefined,
) {
  return {
    identifier,
    attributes,
    type,
  };
}

describe('parseArguments', () => {
  it('should parse no arguments', () => {
    const wgslFn = /* wgsl */ `
      fn constant() -> i32 {
        return 42;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 19, end: 19 });
    expect(args).toStrictEqual([]);
  });

  it('should parse one argument', () => {
    const wgslFn = /* wgsl */ `
      fn identity(a: i32) -> i32 {
        return a;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 19, end: 25 });
    expect(args).toStrictEqual([createArg('a', [], 'i32')]);
  });

  // it('should parse multiple arguments', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(a: i32, b: i32, c: i32) -> i32 {
  //             return a + b + c;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });

  // it('should parse attributes', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(@builtin('vertex_index') a: i32, @location(0) b: i32, c: i32) -> i32 {
  //             return a + b + c;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });

  // it('should parse multiple attributes', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(a: i32, @location(0) @interpolate('flat') b: i32, c: i32) -> i32 {
  //             return a + b + c;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });

  // it('should parse commas in attributes', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(a: i32, @interpolate('flat', 'center') b: i32, c: i32) -> i32 {
  //             return a + b + c;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });

  // it('should parse commas in templates', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(a: array<f32, 4>, b: f32) -> f32 {
  //             return a[0] + b;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });

  // it('should parse inlined comments', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(a: f32, /* bait: f32, */ b: f32) -> f32 {
  //             return a + b;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });

  // it('should parse inlined nested comments', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(a: f32, /* bait1: f32, /* bait2: f32, */ bait3: f32, */ b: f32) -> f32 {
  //             return a + b;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });

  // it('should parse missing argument types', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(a, b: f32) -> f32 {
  //             return a + b;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });

  // it('should parse missing return type', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(a, b) {
  //             return a + b;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });

  // // it('should parse excessive whitespaces', () => {
  // //   const wgslFn = /* wgsl */ `
  // //         fn add(a: i32,                b   :     i32,
  // // c: i32,

  // //                 d: i32)
  // //         ) {
  // //             return a + b;
  // //         }
  // //     `;

  // //   const { args, range } = extractArgs(wgslFn);

  // //   expect(true).toBe(false);
  // // });

  // it('should parse missing argument types', () => {
  //   const wgslFn = /* wgsl */ `
  //         fn add(a, b: f32) {
  //             return a + b;
  //         }
  //     `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(true).toBe(false);
  // });
});

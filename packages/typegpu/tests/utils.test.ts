import { describe, expect, it } from 'vitest';
import { extractArgs } from '../src/utils.ts';

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
  it('should extract no arguments', () => {
    const wgslFn = /* wgsl */ `
      fn constant() -> i32 {
        return 42;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 19, end: 19 });
    expect(args).toStrictEqual([]);
  });

  it('should extract one argument', () => {
    const wgslFn = /* wgsl */ `
      fn identity(a: i32) -> i32 {
        return a;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 19, end: 25 });
    expect(args).toStrictEqual([createArg('a', [], 'i32')]);
  });

  it('should extract multiple arguments', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: i32, b: i32, c: i32) -> i32 {
        return a + b + c;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 14, end: 36 });
    expect(args).toStrictEqual([
      createArg('a', [], 'i32'),
      createArg('b', [], 'i32'),
      createArg('c', [], 'i32'),
    ]);
  });

  it('should extract attributes', () => {
    const wgslFn = /* wgsl */ `
      fn add(@builtin('vertex_index') a: i32, @location(0) b: i32, c: i32) -> i32 {
        return a + b + c;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 14, end: 74 });
    expect(args).toStrictEqual([
      createArg('a', [`@builtin('vertex_index')`], 'i32'),
      createArg('b', [`@location(0)`], 'i32'),
      createArg('c', [], 'i32'),
    ]);
  });

  it('should extract multiple attributes', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: i32, @location(0) @interpolate('flat') b: i32, c: i32) -> i32 {
        return a + b + c;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 14, end: 70 });
    expect(args).toStrictEqual([
      createArg('a', [], 'i32'),
      createArg('b', [`@location(0)`, `@interpolate('flat')`], 'i32'),
      createArg('c', [], 'i32'),
    ]);
  });

  it('should extract commas in attributes', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: i32, @interpolate('flat', 'center') b: i32, c: i32) -> i32 {
        return a + b + c;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 14, end: 67 });
    expect(args).toStrictEqual([
      createArg('a', [], 'i32'),
      createArg('b', [`@interpolate('flat','center')`], 'i32'),
      createArg('c', [], 'i32'),
    ]);
  });

  it('should extract commas in templates', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: array<f32, 4>, b: f32) -> f32 {
        return a[0] + b;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 14, end: 38 });
    expect(args).toStrictEqual([
      createArg('a', [], 'array<f32,4>'),
      createArg('b', [], 'f32'),
    ]);
  });

  it('should extract inlined comments', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: f32, /* bait: f32, */ b: f32) -> f32 {
        return a + b;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 14, end: 45 });
    expect(args).toStrictEqual([
      createArg('a', [], 'f32'),
      createArg('b', [], 'f32'),
    ]);
  });

  it('should extract inlined nested comments', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: f32, /* bait1: f32, /* bait2: f32, */ bait3: f32, */ b: f32) -> f32 {
        return a + b;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 14, end: 76 });
    expect(args).toStrictEqual([
      createArg('a', [], 'f32'),
      createArg('b', [], 'f32'),
    ]);
  });

  it('should extract missing argument types', () => {
    const wgslFn = /* wgsl */ `
      fn add(a, b: f32) -> f32 {
        return a + b;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 14, end: 23 });
    expect(args).toStrictEqual([
      createArg('a', [], undefined),
      createArg('b', [], 'f32'),
    ]);
  });

  it('should extract missing return type', () => {
    const wgslFn = /* wgsl */ `
      fn add(a, b) {
        return a + b;
      }
    `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 14, end: 18 });
    expect(args).toStrictEqual([
      createArg('a', [], undefined),
      createArg('b', [], undefined),
    ]);
  });

  it('should extract excessive whitespaces', () => {
    const wgslFn = /* wgsl */ `
          fn add(a: i32,                b   :     i32,
  c: i32,

                  d: i32)
   {
              return a + b;
          }
      `;

    const { args, range } = extractArgs(wgslFn);

    expect(range).toStrictEqual({ begin: 18, end: 91 });
    expect(args).toStrictEqual([
      createArg('a', [], 'i32'),
      createArg('b', [], 'i32'),
      createArg('c', [], 'i32'),
      createArg('d', [], 'i32'),
    ]);
  });

  // it('should extract comment at the beginning', () => {
  //   const wgslFn = /* wgsl */ `/* () */
  //     fn add(a, b) {
  //       return a + b;
  //     }
  //   `;

  //   const { args, range } = extractArgs(wgslFn);

  //   expect(range).toStrictEqual({ begin: 22, end: 22 });
  //   expect(args).toStrictEqual([
  //     createArg('a', [], undefined),
  //     createArg('b', [], undefined),
  //   ]);
  // });
});

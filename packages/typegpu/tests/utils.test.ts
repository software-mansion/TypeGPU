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
function createReturn(
  attributes: string[],
  type: string,
) {
  return { attributes, type };
}

describe('extract args', () => {
  it('extracts when no arguments', () => {
    const wgslFn = /* wgsl */ `
      fn constant() -> i32 {
        return 42;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 18, end: 28 });
  });

  it('extracts when one argument', () => {
    const wgslFn = /* wgsl */ `
      fn identity(a: i32) -> i32 {
        return a;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([createArg('a', [], 'i32')]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 18, end: 34 });
  });

  it('extracts when multiple arguments', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: i32, b: i32, c: i32) -> i32 {
        return a + b + c;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], 'i32'),
      createArg('b', [], 'i32'),
      createArg('c', [], 'i32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 13, end: 45 });
  });

  it('extracts when trailing comma', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: i32, b: i32,) -> i32 {
        return a + b;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], 'i32'),
      createArg('b', [], 'i32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 13, end: 38 });
  });

  it('extracts when attributes in return type', () => {
    const wgslFn = /* wgsl */ `
      @fragment fn frag(@location(0) pos: vec4f) -> @location(0) @builtin(sample_mask) vec4f {
        return pos;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('pos', ['@location(0)'], 'vec4f'),
    ]);
    expect(ret).toStrictEqual(
      createReturn(['@location(0)', '@builtin(sample_mask)'], 'vec4f'),
    );
    expect(range).toStrictEqual({ begin: 24, end: 94 });
  });

  it('extracts when attributes', () => {
    const wgslFn = /* wgsl */ `
      fn add(@builtin(vertex_index) a: i32, @location(0) b: i32, c: i32) -> i32 {
        return a + b + c;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [`@builtin(vertex_index)`], 'i32'),
      createArg('b', [`@location(0)`], 'i32'),
      createArg('c', [], 'i32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 13, end: 81 });
  });

  it('extracts when multiple attributes', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: i32, @location(0) @interpolate(flat) b: i32, c: i32) -> i32 {
        return a + b + c;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], 'i32'),
      createArg('b', [`@location(0)`, `@interpolate(flat)`], 'i32'),
      createArg('c', [], 'i32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 13, end: 77 });
  });

  it('extracts when commas in attributes', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: i32, @interpolate(flat, center) b: i32, c: i32) -> i32 {
        return a + b + c;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], 'i32'),
      createArg('b', [`@interpolate(flat,center)`], 'i32'),
      createArg('c', [], 'i32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 13, end: 72 });
  });

  it('extracts when commas in templates', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: array<f32, 4>, b: f32) -> f32 {
        return a[0] + b;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], 'array<f32,4>'),
      createArg('b', [], 'f32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'f32'));
    expect(range).toStrictEqual({ begin: 13, end: 47 });
  });

  it('extracts when end of line comments', () => {
    const wgslFn = /* wgsl */ `// ()
      fn add(
        a: f32, // , bait: f32
        b: f32) -> f32//another comment
      {
        return a + b;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], 'f32'),
      createArg('b', [], 'f32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'f32'));
    expect(range).toStrictEqual({ begin: 18, end: 97 });
  });

  it('extracts when inlined comments', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: f32, /* bait: f32, */ b: f32) -> f32 {
        return a + b;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], 'f32'),
      createArg('b', [], 'f32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'f32'));
    expect(range).toStrictEqual({ begin: 13, end: 54 });
  });

  it('extracts when inlined nested comments', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: f32, /* bait1: f32, /* bait2: f32, */ bait3: f32, */ b: f32) -> f32 {
        return a + b;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], 'f32'),
      createArg('b', [], 'f32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'f32'));
    expect(range).toStrictEqual({ begin: 13, end: 85 });
  });

  it('extracts when missing argument types', () => {
    const wgslFn = /* wgsl */ `
      fn add(a, b: f32) -> f32 {
        return a + b;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], undefined),
      createArg('b', [], 'f32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'f32'));
    expect(range).toStrictEqual({ begin: 13, end: 32 });
  });

  it('extracts when missing return type', () => {
    const wgslFn = /* wgsl */ `
      fn add(a, b) {
        return a + b;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], undefined),
      createArg('b', [], undefined),
    ]);
    expect(ret).toBeUndefined();
    expect(range).toStrictEqual({ begin: 13, end: 20 });
  });

  it('extracts when excessive whitespaces', () => {
    const wgslFn = /* wgsl */ `
          fn add(a: i32,                b   :     i32,
  c: i32,

                  d: i32)  ->  i32  
   {
              return a + b;
          }
      `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], 'i32'),
      createArg('b', [], 'i32'),
      createArg('c', [], 'i32'),
      createArg('d', [], 'i32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 17, end: 107 });
  });

  it('extracts when comment at the beginning', () => {
    const wgslFn = /* wgsl */ `/* () */
      fn add(a, b) {
        return a + b;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', [], undefined),
      createArg('b', [], undefined),
    ]);
    expect(ret).toBeUndefined();
    expect(range).toStrictEqual({ begin: 21, end: 28 });
  });

  it('extracts when non-ascii characters present', () => {
    const wgslFn = /* wgsl */ `
      fn hieroglyphs(🧀🧀🧀, سلام, 검정, שָׁלוֹם, गुलाबी, փիրուզ) {
        return;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('🧀🧀🧀', [], undefined),
      createArg('سلام', [], undefined),
      createArg('검정', [], undefined),
      createArg('שָׁלוֹם', [], undefined),
      createArg('गुलाबी', [], undefined),
      createArg('փիրուզ', [], undefined),
    ]);
    expect(ret).toBeUndefined();
    expect(range).toStrictEqual({ begin: 21, end: 65 }); // cheese is of length 2
  });
});

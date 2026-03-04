import { describe, expect, it } from 'vitest';
import { extractArgs } from '../src/core/function/extractArgs.ts';

function createArg(identifier: string, attributes: string[], type: string | undefined) {
  return { identifier, attributes, type };
}
function createReturn(attributes: string[], type: string) {
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

    expect(args).toStrictEqual([createArg('a', [], 'i32'), createArg('b', [], 'i32')]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 13, end: 38 });
  });

  it('extracts when attributes in return type', () => {
    const wgslFn = /* wgsl */ `
      @fragment fn frag(@location(0) pos: vec4f) -> @location(0) @interpolate(flat) vec4f {
        return pos;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([createArg('pos', ['@location(0)'], 'vec4f')]);
    expect(ret).toStrictEqual(createReturn(['@location(0)', '@interpolate(flat)'], 'vec4f'));
    expect(range).toStrictEqual({ begin: 24, end: 91 });
  });

  it('extracts when attributes', () => {
    const wgslFn = /* wgsl */ `
      @vertex fn add(@builtin(vertex_index) a: u32, @location(0) b: i32, c: i32) -> i32 {
        return b + c;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', ['@builtin(vertex_index)'], 'u32'),
      createArg('b', ['@location(0)'], 'i32'),
      createArg('c', [], 'i32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 21, end: 89 });
  });

  it('extracts when multiple attributes', () => {
    const wgslFn = /* wgsl */ `
      @vertex fn add(@location(0) a: i32, @location(1) @interpolate(flat) b: i32, c: i32) -> i32 {
        return a + b + c;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('a', ['@location(0)'], 'i32'),
      createArg('b', ['@location(1)', '@interpolate(flat)'], 'i32'),
      createArg('c', [], 'i32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 21, end: 98 });
  });

  it('extracts when commas in attributes', () => {
    const wgslFn = /* wgsl */ `
      (@location(0) position: vec3f, @interpolate(flat, first) b: i32, c: i32) -> i32 {
        return b + c;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('position', ['@location(0)'], 'vec3f'),
      createArg('b', ['@interpolate(flat,first)'], 'i32'),
      createArg('c', [], 'i32'),
    ]);
    expect(ret).toStrictEqual(createReturn([], 'i32'));
    expect(range).toStrictEqual({ begin: 7, end: 87 });
  });

  it('extracts when commas in argument types', () => {
    const wgslFn = /* wgsl */ `
      fn add(a: array<f32, 4>, b: f32) -> f32 {
        return a[0] + b;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([createArg('a', [], 'array<f32,4>'), createArg('b', [], 'f32')]);
    expect(ret).toStrictEqual(createReturn([], 'f32'));
    expect(range).toStrictEqual({ begin: 13, end: 47 });
  });

  it('extracts when commas in return type', () => {
    const wgslFn = /* wgsl */ `
      fn ident(a: array<array<f32, 4>, 4>) -> array<array<f32, 4>, 4> {
        return a;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([createArg('a', [], 'array<array<f32,4>,4>')]);
    expect(ret).toStrictEqual(createReturn([], 'array<array<f32,4>,4>'));
    expect(range).toStrictEqual({ begin: 15, end: 71 });
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

    expect(args).toStrictEqual([createArg('a', [], 'f32'), createArg('b', [], 'f32')]);
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

    expect(args).toStrictEqual([createArg('a', [], 'f32'), createArg('b', [], 'f32')]);
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

    expect(args).toStrictEqual([createArg('a', [], 'f32'), createArg('b', [], 'f32')]);
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

    expect(args).toStrictEqual([createArg('a', [], undefined), createArg('b', [], 'f32')]);
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

    expect(args).toStrictEqual([createArg('a', [], undefined), createArg('b', [], undefined)]);
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

    expect(args).toStrictEqual([createArg('a', [], undefined), createArg('b', [], undefined)]);
    expect(ret).toBeUndefined();
    expect(range).toStrictEqual({ begin: 21, end: 28 });
  });

  it('extracts when non-ascii characters present', () => {
    const wgslFn = /* wgsl */ `
      fn hieroglyphs(سلام, 검정, שָׁלוֹם, गुलाबी, փիրուզ) {
        return;
      }
    `;

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([
      createArg('سلام', [], undefined),
      createArg('검정', [], undefined),
      createArg('שָׁלוֹם', [], undefined),
      createArg('गुलाबी', [], undefined),
      createArg('փիրուզ', [], undefined),
    ]);
    expect(ret).toBeUndefined();
    expect(range).toStrictEqual({ begin: 21, end: 57 });
  });

  it('extracts when no arguments, no name, no return type', () => {
    const wgslFn = /* wgsl */ '() { return 42; }';

    const { args, ret, range } = extractArgs(wgslFn);

    expect(args).toStrictEqual([]);
    expect(ret).toStrictEqual(undefined);
    expect(range).toStrictEqual({ begin: 0, end: 3 });
  });
});

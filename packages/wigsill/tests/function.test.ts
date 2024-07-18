import { parse } from '@wigsill/parser';
import { describe, expect, it } from 'vitest';
import { wgsl } from '../src';
import { parseWGSL } from './utils/parseWGSL';

describe('wgsl.fn', () => {
  it('should inject function declaration of called function', () => {
    const emptyFn = wgsl.fn()`() {
      // do nothing
    }`.$name('empty');

    const actual = parseWGSL(wgsl`
      fn main() {
        ${emptyFn}();
      }
    `);

    const expected = parse(`
      fn main() {
        empty();
      }

      fn empty() {}
    `);

    expect(actual).toEqual(expected);
  });

  it('should inject function declaration only once', () => {
    const emptyFn = wgsl.fn()`() {
      // do nothing
    }`.$name('empty');

    const actual = parseWGSL(wgsl`
      fn main() {
        ${emptyFn}();
        ${emptyFn}();
      }
    `);

    const expected = parse(`
      fn main() {
        empty();
        empty();
      }

      fn empty() {}
    `);

    expect(actual).toEqual(expected);
  });

  it('should inject function declaration only once (calls are nested)', () => {
    const emptyFn = wgsl.fn()`() {
      // do nothing
    }`.$name('empty');

    const nestedAFn = wgsl.fn()`() {
      ${emptyFn}();
    }`.$name('nested_a');

    const nestedBFn = wgsl.fn()`() {
      ${emptyFn}();
    }`.$name('nested_b');

    const actual = parseWGSL(wgsl`
      fn main() {
        ${nestedAFn}();
        ${nestedBFn}();
      }
    `);

    const expected = parse(`
      fn main() {
        nested_a();
        nested_b();
      }

      fn empty() {}

      fn nested_a() {
        empty();
      }

      fn nested_b() {
        empty();
      }
    `);

    expect(actual).toEqual(expected);
  });
});

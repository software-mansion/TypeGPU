import { parse } from '@wigsill/parser';
import { describe, expect, it } from 'vitest';
import { StrictNameRegistry, WGSLSegment, wgsl } from '../src';
import { ResolutionCtxImpl } from '../src/programBuilder';

function parseWGSL(segment: WGSLSegment) {
  const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

  const resolved = ctx.resolve(segment);

  const resolvedWithDependencies =
    ctx.dependencies.map((d) => ctx.resolve(d)).join('\n') + '\n' + resolved;

  return parse(resolvedWithDependencies);
}

describe('wgsl.fn', () => {
  it('should inject function declaration of called function', () => {
    const emptyFn = wgsl.fn()`() {
      // do nothing
    }`.alias('empty');

    const actual = parseWGSL(wgsl`
      fn main() {
        ${emptyFn}();
      }
    `);

    const expected = parse(`
      fn empty() {}

      fn main() {
        empty();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('should inject function declaration only once', () => {
    const emptyFn = wgsl.fn()`() {
      // do nothing
    }`.alias('empty');

    const actual = parseWGSL(wgsl`
      fn main() {
        ${emptyFn}();
        ${emptyFn}();
      }
    `);

    const expected = parse(`
      fn empty() {}

      fn main() {
        empty();
        empty();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('should inject function declaration only once (calls are nested)', () => {
    const emptyFn = wgsl.fn()`() {
      // do nothing
    }`.alias('empty');

    const nestedAFn = wgsl.fn()`() {
      ${emptyFn}();
    }`.alias('nested_a');

    const nestedBFn = wgsl.fn()`() {
      ${emptyFn}();
    }`.alias('nested_b');

    const actual = parseWGSL(wgsl`
      fn main() {
        ${nestedAFn}();
        ${nestedBFn}();
      }
    `);

    const expected = parse(`
      fn empty() {}

      fn nested_a() {
        empty();
      }

      fn nested_b() {
        empty();
      }

      fn main() {
        nested_a();
        nested_b();
      }
    `);

    expect(actual).toEqual(expected);
  });
});

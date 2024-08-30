import { wgsl } from 'typegpu/experimental';
import { repeat } from 'typegpu/macro';
import { describe, expect, it } from 'vitest';
import { parseWGSL } from './utils/parseWGSL';

describe('repeat', () => {
  it('repeats a function call N times', () => {
    const actual = parseWGSL(wgsl`
      { ${repeat(3, 'a();')} }
    `);

    const expected = parseWGSL(`
      { a(); a(); a(); }
    `);

    expect(actual).toEqual(expected);
  });

  it('repeats a parametrized function call N times', () => {
    const actual = parseWGSL(wgsl`
      { ${repeat(3, (idx) => wgsl`a(${idx});`)} }
    `);

    const expected = parseWGSL(`
      { a(0); a(1); a(2); }
    `);

    expect(actual).toEqual(expected);
  });

  it('repeats n times based on slot value', () => {
    const countSlot = wgsl.slot(3).$name('count');

    const actual = parseWGSL(wgsl`
      { ${repeat(countSlot, (idx) => wgsl`a(${idx});`)} }
    `);

    const expected = parseWGSL(`
      { a(0); a(1); a(2); }
    `);

    expect(actual).toEqual(expected);
  });

  it('iterates in wgsl if count is not known at compile time', () => {
    const countCode = wgsl`3`;

    const actual = parseWGSL(wgsl`
      { ${repeat(countCode, (idx) => wgsl`a(${idx});`)} }
    `);

    const expected = parseWGSL(`
      {
        for (var i = 0; i < 3; i += 1) {
          a(i);
        }
      }
    `);

    expect(actual).toEqual(expected);
  });
});

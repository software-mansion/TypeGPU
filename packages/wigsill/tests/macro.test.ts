import { describe, expect, it } from 'vitest';
import { repeat, wgsl } from 'wigsill';
import { parseWGSL } from './utils/parseWGSL';

describe('repeat', () => {
  it('repeats a string', () => {
    const actual = parseWGSL(repeat(3, 'a'));
    const expected = parseWGSL(wgsl`aaa`);

    expect(actual).toEqual(expected);
  });

  it('repeats a computed string', () => {
    const actual = parseWGSL(repeat(3, (idx) => `a${idx}`));
    const expected = parseWGSL(wgsl`a0a1a2`);

    expect(actual).toEqual(expected);
  });

  it('repeats n times based on slot value', () => {
    const countSlot = wgsl.slot(3).$name('count');

    const actual = parseWGSL(repeat(countSlot, (idx) => `a${idx}`));
    const expected = parseWGSL(wgsl`a0a1a2`);

    expect(actual).toEqual(expected);
  });
});

import { describe, expect, it } from 'vitest';
import { repeat, wgsl } from 'wigsill';

describe('repeat', () => {
  it('repeats a string', () => {
    const result = repeat('a', 3);
    expect(result).toEqual(wgsl`${['a', 'a', 'a']}`);
  });

  it('repeats a computed string', () => {
    const result = repeat((idx) => `a${idx}`, 3);
    expect(result).toEqual(wgsl`${['a0', 'a1', 'a2']}`);
  });
});

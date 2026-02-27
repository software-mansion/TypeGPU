import { describe, expect, it } from 'vitest';
import tgpu, { d, std } from '../../../src/index.js';

describe('round', () => {
  it('rounds to even numbers', () => {
    const myRound = tgpu.fn([d.f32], d.f32)((a) => std.round(a));

    expect(myRound(2.4)).toBe(2);
    expect(myRound(2.5)).toBe(2);
    expect(myRound(2.6)).toBe(3);
    expect(myRound(3.4)).toBe(3);
    expect(myRound(3.5)).toBe(4);
    expect(myRound(3.6)).toBe(4);
    expect(tgpu.resolve([myRound])).toMatchInlineSnapshot(`
      "fn myRound(a: f32) -> f32 {
        return round(a);
      }"
    `);
  });
});

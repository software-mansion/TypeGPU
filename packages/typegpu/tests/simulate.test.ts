import { describe, expect } from 'vitest';
import tgpu, { d } from '../src/index.js';
import { it } from './utils/extendedIt.ts';

describe('tgpu.simulate()', () => {
  it('runs the callback synchronously and returns the result', () => {
    const result = tgpu['~unstable'].simulate(() => 2 + 3);
    expect(result.value).toEqual(5);
  });

  it('allows for nested simulations (*inception horn*)', () => {
    const seed = tgpu.privateVar(d.u32, 1);

    // A stateful function
    const hash = tgpu.fn([], d.u32)(() => {
      return seed.$++;
    });

    const result = tgpu['~unstable'].simulate(() => {
      const v1 = hash(); // = 1
      const v2 = hash(); // = 2
      // Using `hash` in a nested simulation, should have it's own state
      const nested = tgpu['~unstable'].simulate(hash).value; // = 1
      const v3 = hash(); // = 3
      return nested + v3; // = 4
    });

    expect(result.value).toEqual(4);
  });
});

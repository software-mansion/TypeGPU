import { describe, expect } from 'vitest';
import { it } from './utils/extendedIt.ts';
import tgpu from '../src/index.ts';

describe('tgpu.simulate()', () => {
  it('runs the callback synchronously and returns the result', () => {
    const result = tgpu['~unstable'].simulate(() => 2 + 3);
    expect(result).toEqual(5);
  });
});

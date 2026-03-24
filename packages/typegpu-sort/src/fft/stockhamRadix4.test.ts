import { describe, expect, it } from 'vitest';
import {
  _forTesting,
  radix4LineStageCount,
  radix4TwiddleLutVec2Count,
  radix4TwiddleOffset,
} from './stockhamRadix4.ts';

const { radix4PValues } = _forTesting;

describe('radix4LineStageCount', () => {
  it.each([
    [2, 1],
    [4, 1],
    [8, 2],
    [16, 2],
    [32, 3],
    [64, 3],
    [128, 4],
    [256, 4],
    [512, 5],
    [1024, 5],
    [2048, 6],
  ])('matches documented schedule for n=%i', (n, expected) => {
    expect(radix4LineStageCount(n)).toBe(expected);
  });

  it('equals floor(log2(n)/2) + (log2(n) mod 2) for powers of two through 2^16', () => {
    for (let k = 1; k <= 16; k++) {
      const n = 1 << k;
      expect(radix4LineStageCount(n)).toBe(Math.floor(k / 2) + (k % 2));
    }
  });
});

describe('radix4PValues', () => {
  it.each([
    [4, [1]],
    [8, [1]],
    [16, [1, 4]],
    [32, [1, 4]],
    [64, [1, 4, 16]],
    [256, [1, 4, 16, 64]],
    [1024, [1, 4, 16, 64, 256]],
  ])('forward p sequence for n=%i', (n, expected) => {
    expect(radix4PValues(n)).toEqual(expected);
  });

  it('has length floor(log2(n)/2) for n >= 4', () => {
    for (let k = 2; k <= 14; k++) {
      const n = 1 << k;
      expect(radix4PValues(n).length).toBe(Math.floor(k / 2));
    }
  });

  it('is empty when log2(n) < 2', () => {
    expect(radix4PValues(2)).toEqual([]);
  });

  it('each entry is 4× the previous', () => {
    const ps = radix4PValues(4096);
    expect(ps[0]).toBe(1);
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i]).toBe(ps[i - 1]! * 4);
    }
  });

  it('inverse order is descending p (contract for dispatchRadix4LineFft inverse loop)', () => {
    const ps = radix4PValues(1024);
    const inv = ps.toReversed();
    expect(inv).toEqual([256, 64, 16, 4, 1]);
  });
});

describe('radix4TwiddleLutVec2Count (3-wide twiddles per k)', () => {
  it('matches 3 × Σp for nMax', () => {
    expect(radix4TwiddleLutVec2Count(64)).toBe(63);
    expect(radix4TwiddleLutVec2Count(1024)).toBe(1023);
  });

  it('radix4TwiddleOffset(p) is p − 1 in vec2 indices', () => {
    expect(radix4TwiddleOffset(1)).toBe(0);
    expect(radix4TwiddleOffset(4)).toBe(3);
    expect(radix4TwiddleOffset(16)).toBe(15);
  });
});

describe('radix4 schedule invariants', () => {
  it('line stage count equals radix-4 passes plus optional radix-2 tail', () => {
    for (let k = 1; k <= 16; k++) {
      const n = 1 << k;
      const tail = k % 2;
      expect(radix4LineStageCount(n)).toBe(radix4PValues(n).length + tail);
    }
  });
});

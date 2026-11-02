import { expect, it } from 'vitest';
import { getLayout } from '../src/holographic/layout.ts';

it.each([
  [64, 64],
  [73, 29],
  [2, 127],
])('allocates both rotated hierarchies for %ix%i', (width, height) => {
  const info = getLayout([width, height]);
  for (const [along, across] of [
    [width, height],
    [height, width],
  ] as const) {
    for (let level = 0; level <= Math.ceil(Math.log2(along)); level++) {
      const step = 2 ** level;
      expect(info.intervalCounts[level]).toBeGreaterThanOrEqual(
        Math.ceil(along / step) * across * (step + 1),
      );
      expect(info.fluenceCount).toBeGreaterThanOrEqual(Math.ceil(along / step) * across * step);
    }
  }
});

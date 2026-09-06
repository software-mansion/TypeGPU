import { describe, expect, it } from 'vitest';
import { generate as baseline } from '../benchmarks/blue-noise/baseline.ts';
import { cases, seeds } from '../benchmarks/blue-noise/cases.ts';

describe('blue-noise benchmark variants', () => {
  it.each([4, 5, 8, 17, 32, 63, 64, 128])(
    'matches the baseline exactly at size %s',
    (size) => {
      for (const seed of seeds) {
        const expected = baseline({ size, seed });
        for (const { name, run } of cases.slice(1)) {
          expect(run(size, seed), `${name}, size ${size}, seed ${seed}`).toEqual(expected);
        }
      }
    },
    60_000,
  );
});

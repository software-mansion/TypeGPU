import { bench, describe } from 'vitest';
import { cases, seeds, sizes } from './cases.ts';

describe.each(sizes.map((size) => ({ size })))('$size×$size (three-seed batch)', ({ size }) => {
  for (const { name, run } of cases) {
    bench(
      name,
      () => {
        for (const seed of seeds) run(size, seed);
      },
      { time: 0, iterations: 6, warmupTime: 0, warmupIterations: 1 },
    );
  }
});

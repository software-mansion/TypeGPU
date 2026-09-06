import { bench, describe } from 'vitest';
import { cases, seeds, sizes } from './cases.ts';

for (const size of sizes) {
  describe(`${size}×${size} (three-seed batch)`, () => {
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
}

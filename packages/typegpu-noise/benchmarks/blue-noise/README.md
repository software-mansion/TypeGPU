# Blue-noise CPU generation benchmarks

Run from the repository root using Vitest's experimental benchmark API:

```sh
pnpm --filter @typegpu/noise benchmark:blue-noise
pnpm --filter @typegpu/noise benchmark:blue-noise --outputJson /tmp/blue-noise-vitest.json
```

To compare with a previous Vitest report, pass `--compare /tmp/blue-noise-vitest.json`.
Benchmarks are separate from `vitest run`; correctness checks live in the package's
regular tests.

## Variants

The baseline imports a frozen copy of the original CPU generator from `baseline.ts`.
The `doubled-fused` entry now calls the optimized production generator directly.
`variants.ts` retains the experimental implementations for comparison:

| Variant | Energy update | Extrema search |
| --- | --- | --- |
| baseline | Original modulo wrapping | Separate scan |
| fused | Original modulo wrapping | Fused into the update |
| split | Split each row at its horizontal wrap; one vertical wrap check per row | Separate scan |
| split-fused | Split rows | Fused into the update |
| doubled | Read a contiguous window in a 2×2 repeated kernel | Separate scan |
| doubled-fused | Repeated kernel | Fused into the update |

Fused scans cache the maximum occupied-pixel energy and minimum empty-pixel
energy. The caches are refreshed when restoring the prototype pattern. All
variants retain the full Gaussian, Float64 energy accumulation, row-major visit
order, strict comparisons for tie-breaking, and the original algorithm phases.
The update loops are separate functions to avoid a variant-selection branch
inside the per-pixel loop.

The doubled variants allocate an additional `4 * size²` Float64 values: 128 KiB
at 64×64 and 512 KiB at 128×128. The split variants require no expanded kernel.

Fused scans and repeated lookup tables are inspired by
[Martin Fiedler's C implementation](https://gist.github.com/kajott/d9f9bb93043040bfe2f48f4f499903d8).

## Method

- Use Vitest's `bench()` API, with a comparison group for each size: 32, 63, 64,
  and 128.
- Each iteration generates three complete masks, with seeds 0, 42, and 4294967295.
  Reported times and throughput refer to this three-mask batch, not one mask.
- Include allocations, seeding, kernel setup, relaxation, and ranking in timing.
- Warm up with one batch, then measure six batches per variant. Time-based minimums
  are disabled so slow cases do not receive fewer samples or a different seed mix.
- Let Vitest report timing statistics and relative performance. Variants run in
  Vitest's order; the old harness's per-round rotation is no longer used.
- Check exact output parity separately in `tests/blue-noise-variants.test.ts` at
  sizes 4, 5, 8, 17, 32, 63, 64, and 128 for all three seeds. Assertions are never
  part of benchmark timing.

Results are exploratory measurements on one machine, not a cross-platform
performance guarantee. Six samples are sufficient for an initial comparison,
not a rigorous confidence interval. Increase the iteration count for more
extensive measurements.

The winning doubled-fused approach has been promoted to the production generator.
Production also saves/restores cached extrema with the prototype, avoiding the
experimental variant's one-time scan after restoration.

The historical results below were collected with the previous custom harness,
which measured individual masks and rotated variant order. Its JSON reports are
preserved for reference and cannot be used with Vitest's `--compare` option.

## Initial results

Measured before promotion on Apple M3 Pro, Node 24.20.0 (V8), and Bun 1.3.10 (JavaScriptCore).
Numbers below are medians in milliseconds for complete 64×64 generation.

| Variant | Node | Speedup | Bun | Speedup |
| --- | ---: | ---: | ---: | ---: |
| baseline | 69.03 | 1.00× | 50.16 | 1.00× |
| fused | 46.86 | 1.47× | 35.46 | 1.41× |
| split | 59.92 | 1.15× | 46.04 | 1.09× |
| split-fused | 43.98 | 1.57× | 37.43 | 1.34× |
| doubled | 58.14 | 1.19× | 45.21 | 1.11× |
| doubled-fused | 33.29 | 2.07× | 30.77 | 1.63× |

At 128×128, doubled-fused improves Node from 1222.9 ms to 549.0 ms, and Bun from 857.9 ms to 504.3 ms.

Doubled-fused wins at every measured size in both runtimes. It is the strongest
candidate, now implemented in production. Fused scans alone are a useful lower-memory
alternative; split wrapping combined with fusion does not consistently improve on
fusion alone across engines and sizes.

All parity checks passed in both runtimes. Because outputs match exactly, these
variants preserve the baseline mask quality for the tested inputs. No Gaussian
truncation or precision reduction was used.

Full samples, ranges, timestamps, and runtime metadata: [Node](results/node.json)
and [Bun](results/bun.json).

## Production verification

The promoted package implementation was remeasured against the frozen baseline
in Node 24.20.0. All exact-output checks passed, including size 128.

| Size | Original (ms) | Production (ms) | Speedup |
| --- | ---: | ---: | ---: |
| 32×32 | 4.40 | 2.46 | 1.79× |
| 63×63 | 65.60 | 31.64 | 2.07× |
| 64×64 | 70.38 | 34.17 | 2.06× |
| 128×128 | 1129.21 | 501.41 | 2.25× |

Raw results: [Node production verification](results/node-production.json).

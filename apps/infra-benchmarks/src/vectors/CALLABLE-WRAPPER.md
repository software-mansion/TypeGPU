# callableSchema forwarding-wrapper experiment

Measured 2026-09-16T15:36:23.376Z on Apple M3 Pro, Node v24.21.0, V8 13.6.233.17-node.53.

Compared the current optimized vector implementation with `const impl = options.normalImpl as DualFn<T>` in callableSchema. Both variants use the same module hook and TypeScript stripping. This removes the forwarding rest/spread closure for scalar, vector and matrix schemas. Three fresh processes per variant, default warmup and sample settings.

No meaningful vector-construction improvement was observed. Public vec2f/vec3f/vec4f and direct vec3f construction were slightly slower (about 1–2%). Most arithmetic differences were a few percent. Manual reversal showed a larger shift, but this does not establish a general wrapper cost. V8 inlining/removal of forwarding overhead is a plausible explanation, not something established by a compiler trace in this experiment.

Production callableSchema remains unchanged. Direct reuse would mutate the original normalImpl with schema metadata, change function identity/reflection (.name and sometimes .length), and change receiver handling: the wrapper invokes normalImpl with options as this, while direct reuse receives the caller's this. Current implementations do not use this. GPU metadata and custom toString are still attached by the experiment.

## Results

ns per workload iteration: median of three process medians. Above 1 is faster.

| Workload | Wrapper ns | Direct ns | Speedup |
| --- | ---: | ---: | ---: |
| public/vec2f | 38.97 | 39.36 | 0.99× |
| public/vec3f | 56.70 | 57.05 | 0.99× |
| public/vec4f | 70.48 | 71.13 | 0.99× |
| direct/vec3f | 54.00 | 54.97 | 0.98× |
| public/zero | 53.54 | 52.06 | 1.03× |
| public/splat | 54.93 | 54.98 | 1.00× |
| public/copy | 487.57 | 494.46 | 0.99× |
| public/composed | 438.55 | 443.94 | 0.99× |
| public/vec3i-fractional | 124.18 | 122.03 | 1.02× |
| public/vec3u-fractional | 128.37 | 123.51 | 1.04× |
| public/vec3h-fractional | 164.60 | 160.56 | 1.03× |
| public/mixed | 129.44 | 127.42 | 1.02× |
| std/add | 998.78 | 959.40 | 1.04× |
| std/normalize | 763.63 | 758.74 | 1.01× |
| std/mul-add-chain | 1727.85 | 1694.03 | 1.02× |
| manual/add | 119.67 | 117.54 | 1.02× |
| manual/reverse4 | 140.92 | 131.70 | 1.07× |
| swizzle/reverse4 | 432.09 | 433.20 | 1.00× |
| swizzle/compose | 1203.06 | 1216.96 | 0.99× |
| read/named | 1.69 | 1.74 | 0.97× |
| read/indexed | 230.64 | 229.79 | 1.00× |
| std/dot | 84.44 | 81.91 | 1.03× |
| write/named | 293.31 | 303.84 | 0.97× |
| write/indexed | 266.57 | 265.01 | 1.01× |

Ranges of the three process medians:

| Workload | Wrapper ns range | Direct ns range |
| --- | ---: | ---: |
| public/vec3f | 56.67–138.61 | 56.17–58.55 |
| direct/vec3f | 53.92–54.17 | 54.37–60.79 |
| std/add | 994.46–1001.61 | 958.41–986.53 |
| manual/reverse4 | 138.95–141.62 | 130.44–143.73 |

Retained memory was approximately 104 bytes/vec3f for both variants. This does not measure startup function/closure allocations.

Reproduce: `VECTOR_VARIANTS=baseline,no-callable-wrapper pnpm --filter infra-benchmarks vectors`.
Raw samples from this run: `/tmp/vector-wrapper-results.json`.

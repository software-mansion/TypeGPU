# Measured CPU vector costs

These are the original measurements, before the scalar fast path and direct named getters were applied to production. The current harness calls that implementation `previous`; see [README.md](README.md) for the updated variants.

Measured 2026-09-16T14:42:31.289Z on Apple M3 Pro, darwin/arm64, Node v24.21.0, V8 13.6.233.17-node.53.
Source revision: `c9afc0b74db015f208b64b3193df830f2526b689`.
Production vector source was unchanged. Three processes per variant; 75 ms warmup, 15 × 15 ms samples per workload, batches of 256.

## Interpretation

The largest construction cost in this experiment is the public argument-processing path. Public vec3f took **267.4 ns**, versus **46.6 ns** for direct construction. Keeping the public API but adding the scalar-only fast path reduced it to **49.4 ns (5.41× faster)**. This bypasses the intermediate array and flattening loop together; the experiment does not attribute that gain to Array.from alone.

The presence of 672 swizzle getters was not a meaningful construction bottleneck here (0.99× for vec3f). They are prototype properties, not per-instance storage. Actually using swizzles remains costly: each creates and casts another vector. Removing their definitions is not supported as a useful optimization by these measurements.

Initialization coercion matters, especially after argument processing is bypassed: removing it improved public vec3f by **1.14×**, direct construction by **2.74×**, and half-float creation by **1.39×**. Removing coercion changes numeric semantics; these are diagnostic ceilings, not safe substitutions.

Instance size is also distinct from construction time. Removing Array inheritance reduced retained vec3f size from roughly **104 to 64 bytes**, while scalar creation barely changed. Eight extra own fields increased it to **168 bytes** and slowed direct construction by about 12%. Metadata caching did not materially help construction. This is consistent with metadata being transient and potentially optimized away, but does not prove allocation elimination.

Inherited numeric component access is a separate major bottleneck. Making named getters read their backing fields directly reduced three-component reads from **204.1 to 1.51 ns per vector** in this tight loop, and std.dot from **462.0 to 72.8 ns (6.35×)**. The tiny read-only number is a microbenchmark result; the dot improvement supplies a more representative arithmetic comparison. Numeric access and setters were unchanged.

The most promising follow-ups are the scalar constructor fast path and direct named getters. Preserve conversion semantics when evaluating production changes. Array representation is worth investigating for memory-heavy workloads. The combined variant is deliberately incompatible and its gains are not additive.

Small differences, particularly the repeated 1–6% shifts across unrelated workloads, should not be interpreted as established causal improvements. Process ranges below are descriptive, not confidence intervals. This run does not establish results for other JS engines.

## All workloads

Median of process medians. Baseline is ns per workload iteration; other columns are baseline/variant ratios. Above 1 is faster. N/A means the functionality was removed.

| Workload | Baseline ns | no-swizzles | cached-metadata | no-init-coercion | no-array | direct-named-access | scalar-fast-path | extra-payload | combined |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| public/vec2f | 224.1 | 0.99× | 1.00× | 1.11× | 1.01× | 1.00× | 6.61× | 0.98× | 17.19× |
| public/vec3f | 267.4 | 0.99× | 0.99× | 1.14× | 1.00× | 0.99× | 5.41× | 0.97× | 15.06× |
| public/vec4f | 311.7 | 0.99× | 1.00× | 1.16× | 1.00× | 1.00× | 5.23× | 0.97× | 16.72× |
| direct/vec3f | 46.6 | 0.99× | 1.03× | 2.74× | 1.02× | 0.99× | 1.00× | 0.89× | 2.98× |
| public/zero | 125.3 | 1.03× | 1.04× | 1.30× | 1.03× | 1.03× | 2.85× | 0.97× | 7.85× |
| public/splat | 212.1 | 1.02× | 1.04× | 1.17× | 1.02× | 1.01× | 4.56× | 0.99× | 13.28× |
| public/copy | 451.8 | 1.04× | 1.04× | 1.12× | 1.07× | 1.04× | 1.04× | 1.03× | 1.16× |
| public/composed | 414.5 | 1.06× | 1.06× | 1.17× | 1.08× | 1.06× | 1.06× | 1.05× | 1.20× |
| public/vec3i-fractional | 337.8 | 1.05× | 1.05× | 1.22× | 1.18× | 1.04× | 3.16× | 1.00× | 8.33× |
| public/vec3u-fractional | 332.0 | 1.03× | 1.02× | 1.19× | 1.15× | 1.01× | 3.01× | 0.97× | 7.75× |
| public/vec3h-fractional | 391.1 | 1.08× | 1.10× | 1.39× | 1.22× | 1.08× | 2.70× | 1.04× | 9.18× |
| public/mixed | 351.0 | 1.05× | 1.06× | 1.22× | 1.17× | 1.05× | 3.13× | 1.02× | 8.69× |
| std/add | 1135.8 | 1.05× | 1.02× | 1.09× | 1.05× | 1.03× | 1.33× | 1.03× | 1.45× |
| std/normalize | 1159.0 | 1.03× | 1.02× | 1.09× | 1.07× | 1.26× | 1.34× | 1.03× | 1.99× |
| std/mul-add-chain | 1965.2 | 1.00× | 0.98× | 1.06× | 1.04× | 0.99× | 1.34× | 1.00× | 1.51× |
| manual/add | 723.5 | 0.98× | 1.01× | 1.06× | 1.08× | 2.26× | 1.43× | 1.00× | 21.62× |
| manual/reverse4 | 654.1 | 0.99× | 1.01× | 1.11× | 1.08× | 1.77× | 1.64× | 0.99× | 18.29× |
| swizzle/reverse4 | 391.4 | N/A | 1.02× | 1.22× | 1.14× | 1.00× | 1.02× | 0.99× | N/A |
| swizzle/compose | 1125.7 | N/A | 1.07× | 1.19× | 1.20× | 1.06× | 1.07× | 1.04× | N/A |
| read/named | 204.1 | 1.01× | 1.02× | 1.02× | 1.05× | 135.04× | 1.03× | 1.02× | 135.39× |
| read/indexed | 205.9 | 1.02× | 1.03× | 1.02× | 1.06× | 0.98× | 1.03× | 1.02× | 1.05× |
| std/dot | 462.0 | 1.02× | 0.99× | 0.99× | 1.03× | 6.35× | 1.01× | 1.01× | 6.43× |
| write/named | 259.9 | 1.01× | 1.03× | 1.25× | 1.07× | 0.99× | 1.00× | 0.96× | 1.30× |
| write/indexed | 234.0 | 1.01× | 1.02× | 1.15× | 1.07× | 1.00× | 1.01× | 0.97× | 1.18× |

## Process-to-process variation

Range of the three process medians in ns/iteration (not individual sample extremes).

| Variant | Public vec3f | Direct vec3f | Named read | std.dot |
| --- | ---: | ---: | ---: | ---: |
| baseline | 267.03–267.81 | 46.16–49.21 | 198.05–210.06 | 453.05–471.15 |
| no-swizzles | 268.23–270.84 | 46.30–47.30 | 199.21–202.39 | 450.73–467.49 |
| cached-metadata | 262.67–276.49 | 45.07–47.28 | 198.02–200.89 | 450.43–467.65 |
| no-init-coercion | 233.02–235.73 | 16.89–20.15 | 199.53–224.20 | 466.02–475.29 |
| no-array | 267.77–268.39 | 45.34–45.64 | 193.33–197.73 | 443.59–457.44 |
| direct-named-access | 268.86–269.86 | 46.28–47.63 | 1.50–1.62 | 71.11–73.12 |
| scalar-fast-path | 48.01–50.09 | 46.17–47.83 | 198.22–200.36 | 455.55–457.83 |
| extra-payload | 274.85–275.92 | 51.97–53.55 | 197.64–201.77 | 453.05–498.80 |
| combined | 17.33–18.79 | 15.63–15.69 | 1.50–1.51 | 69.54–73.81 |

## Retained memory

Median heap delta per vec3f, including the reference array; not transient allocation volume.

| Variant | Bytes/vector |
| --- | ---: |
| baseline | 104.1 |
| no-swizzles | 104.1 |
| cached-metadata | 104.1 |
| no-init-coercion | 104.1 |
| no-array | 64.1 |
| direct-named-access | 104.1 |
| scalar-fast-path | 104.1 |
| extra-payload | 168.1 |
| combined | 64.1 |

See [README.md](README.md) for transforms, semantic limitations, methodology and reproduction commands.
The original raw timing samples from this run were saved to `/tmp/vector-results.json`; rerunning the command produces the same JSON format.

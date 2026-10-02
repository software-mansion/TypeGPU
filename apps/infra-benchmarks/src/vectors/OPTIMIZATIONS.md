# Behavior-preserving vector optimizations

Measured 2026-09-16T15:04:38.807Z, Apple M3 Pro, Node v24.21.0, V8 13.6.233.17-node.53 (darwin/arm64).

Applied two changes: scalar-only constructors bypass the intermediate values array and flattening loop; named component getters read backing fields directly. Scalar conversion, setters, vector-argument flattening, swizzles and Array inheritance are retained.

The `previous` variant reverses exactly these edits in memory. Both transformed source files were verified byte-for-byte against revision `c9afc0b74db015f208b64b3193df830f2526b689`. Each variant ran in three fresh processes with the default measurement settings from [README.md](README.md).

## Before and after

Median of process medians, ns per workload iteration. Speedup = previous / current. Small changes in untouched paths may be noise or indirect JIT effects.

| Workload | Previous ns | Current ns | Speedup |
| --- | ---: | ---: | ---: |
| public/vec2f | 220.81 | 33.56 | 6.58× |
| public/vec3f | 268.53 | 49.03 | 5.48× |
| public/vec4f | 314.87 | 58.08 | 5.42× |
| direct/vec3f | 46.80 | 45.14 | 1.04× |
| public/zero | 119.88 | 44.41 | 2.70× |
| public/splat | 205.14 | 44.74 | 4.59× |
| public/copy | 424.13 | 407.89 | 1.04× |
| public/composed | 383.69 | 365.07 | 1.05× |
| public/vec3i-fractional | 319.18 | 109.93 | 2.90× |
| public/vec3u-fractional | 324.32 | 107.03 | 3.03× |
| public/vec3h-fractional | 360.88 | 144.79 | 2.49× |
| public/mixed | 330.37 | 113.75 | 2.90× |
| std/add | 1124.40 | 846.87 | 1.33× |
| std/normalize | 1141.86 | 671.33 | 1.70× |
| std/mul-add-chain | 1958.82 | 1548.71 | 1.26× |
| manual/add | 736.20 | 102.89 | 7.16× |
| manual/reverse4 | 664.42 | 119.82 | 5.55× |
| swizzle/reverse4 | 385.62 | 369.91 | 1.04× |
| swizzle/compose | 1050.86 | 1004.50 | 1.05× |
| read/named | 203.50 | 1.45 | 139.89× |
| read/indexed | 201.09 | 195.66 | 1.03× |
| std/dot | 470.63 | 67.71 | 6.95× |
| write/named | 258.07 | 250.14 | 1.03× |
| write/indexed | 231.60 | 227.87 | 1.02× |

## Process variation

Ranges of three process medians, not confidence intervals.

| Workload | Previous ns range | Current ns range |
| --- | ---: | ---: |
| public/vec3f | 251.44–270.10 | 46.87–50.36 |
| std/dot | 445.78–487.23 | 65.53–70.97 |
| std/normalize | 1080.14–1168.18 | 632.75–673.53 |
| manual/add | 688.84–743.28 | 99.91–107.98 |
| read/named | 193.25–225.38 | 1.45–1.52 |

Retained vec3f memory remained approximately **104 bytes/vector** in both variants, including the reference array.

Validation: all **2,486 TypeGPU tests** passed (183 files), including 46 added regression cases covering all 15 vector types and mixed constructors. TypeGPU and benchmark type checks, lint, formatting, and all benchmark variant smoke checks passed.

Raw samples for this run: `/tmp/vector-optimized-results.json`.
Reproduce with `VECTOR_VARIANTS=baseline,previous pnpm --filter infra-benchmarks vectors`.

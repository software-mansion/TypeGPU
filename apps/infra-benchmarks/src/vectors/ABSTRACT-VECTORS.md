# Abstract vector construction

The new `d.vec2`, `d.vec3`, and `d.vec4` constructors always produce abstract
vectors. Their instances store only named components, do not inherit Array,
and retain JavaScript number precision. Concrete constructors keep their existing
behavior. These timings compare different semantics, not interchangeable APIs.

Measured on Apple M3 Pro (arm64), Node v24.21.0 / V8 13.6.233.17-node.53:
three fresh baseline processes, 15 samples per workload, 15 ms per sample,
75 ms warmup. Values are medians of process medians.

| Components | Concrete f32 constructor | Abstract constructor | Ratio |
| --- | ---: | ---: | ---: |
| 2 | 31.7 ns | 7.4 ns | 4.3× |
| 3 | 46.7 ns | 8.6 ns | 5.4× |
| 4 | 56.7 ns | 8.7 ns | 6.5× |

Retaining 100,000 instances used approximately 104.1 bytes per `vec3f` versus
56.0 bytes per abstract `vec3`, including the reference array (about 46% less).
This does not account for transient allocations or shared prototype storage.

These are constructor measurements on one engine and machine. They do not
predict end-to-end application speed or isolate the individual contributions
of precision conversion, representation, and dispatch.

Reproduce with:

```sh
VECTOR_VARIANTS=baseline VECTOR_REPEATS=3 VECTOR_OUTPUT=/tmp/abstract-vector-results.json \
  pnpm --filter infra-benchmarks vectors
```

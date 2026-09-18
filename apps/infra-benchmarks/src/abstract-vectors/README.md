# Abstract vectors versus direct JavaScript

[RESULTS.md](RESULTS.md) records the measured before/after optimization results.

```sh
pnpm --filter infra-benchmarks abstract-vectors
```

Requires Node 24.2+ and installed workspace dependencies. Results go to
`abstract-vector-results.json` in the working directory. To select output and
increase measurement time:

```sh
VECTOR_REPEATS=5 VECTOR_SAMPLE_MS=30 VECTOR_OUTPUT=/tmp/vectors.json \
  pnpm --filter infra-benchmarks abstract-vectors
```

For a functional smoke test (not performance evidence):

```sh
VECTOR_REPEATS=1 VECTOR_SAMPLES=3 VECTOR_SAMPLE_MS=2 VECTOR_WARMUP_MS=5 \
  VECTOR_OUTPUT=/tmp/vectors-smoke.json pnpm --filter infra-benchmarks abstract-vectors
```

## Baselines and workloads

The baseline is the fastest **measured** contender per workload: straight-line
JavaScript using object literals, small classes with only component fields, or
ordinary number arrays. This is an empirical lower-bound comparison, not a claim
that no possible JS program or engine could be faster. All contenders retain JS
number precision. No Float32Array narrowing, output reuse, pooling, or mutation
is allowed. TypeGPU is called through its public `d` and `std` exports.

For each of vec2, vec3, and vec4, measure construction, copy, addition, scalar
multiplication, multiply/add chains, normalization, dot product, length, sine,
and reverse swizzling. Also measure vec3 cross products. Chained arithmetic uses
separate addition and multiplication functions on both sides; the JIT may inline
and eliminate intermediate objects in either implementation.

The worker generates dimension-specific functions for the plain-JS contenders.
Generation is outside timing, uses only checked-in expressions, and avoids adding
a generic vector library's dispatch cost to the baseline. All implementations
have the same varying, fractional inputs and fresh result semantics. Before
timing, every component of all 256 inputs is checked against independent scalar
math, and freshness and unchanged inputs are checked.

Each iteration's result escapes into a retained ring. Every sample consumes the
ring into a checksum. Inputs, the ring, correctness checks, and source loading
are outside timing. GC is explicitly requested after warmup, never inside timing;
natural collection remains included. Scalar results escape in the same ring.
These are end-to-end operation costs, including common harness overhead, not
intrinsic instruction or allocation timings.

Default settings are three independent processes per implementation, 60 ms
warmup per workload, and nine samples of at least 12 ms. Batches contain 256
iterations. Implementation order rotates each round. Workloads share a process
within an implementation, so earlier dimensions and operations can affect JIT
feedback; this deliberately includes polymorphism rather than only measuring
isolated monomorphic functions. The report uses the median of process medians.
JSON includes every sample, settings, Node/V8 version, CPU, and platform.

At these scales, small ratios can change between runs. Shared CI runners add
noise. Compare repeated runs and absolute nanoseconds; the fastest-of-three JS
comparison is deliberately demanding. Benchmark timing is advisory, while
correctness failures fail the job.

## CI and revision comparisons

[abstract-vector-benchmark.yml](../../../../.github/workflows/abstract-vector-benchmark.yml)
follows the tree-shake workflow: check out the PR and target branches, install
both, run comparisons, and update one PR comment. Manual dispatch accepts a
target branch and publishes the job summary and artifacts. PR runs are restricted
to branches in this repository, matching the existing workflow's trust model.

The **PR harness** runs against both source trees via `VECTOR_SOURCE_ROOT`, so
adding or changing the benchmark doesn't require it to exist on the target.
When the target has no abstract-vector API it reports N/A. Other failures are
not silently suppressed. The workflow uploads raw JSON and the Markdown report.

```sh
VECTOR_SOURCE_ROOT=/absolute/path/to/target-checkout VECTOR_OUTPUT=/tmp/target.json \
  node apps/infra-benchmarks/src/abstract-vectors/run.ts
VECTOR_OUTPUT=/tmp/current.json node apps/infra-benchmarks/src/abstract-vectors/run.ts
node apps/infra-benchmarks/src/abstract-vectors/report.ts /tmp/current.json /tmp/target.json
```

`JS / TypeGPU` near 1× means parity; below 1× means TypeGPU is slower.
`Target / PR` above 1× means the PR is faster. Source paths may point to a target
checkout without this harness, but that checkout must have its dependencies installed.

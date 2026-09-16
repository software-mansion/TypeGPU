# CPU vector ablation benchmark

[OPTIMIZATIONS.md](OPTIMIZATIONS.md) records the before/after results for the applied changes.
[CALLABLE-WRAPPER.md](CALLABLE-WRAPPER.md) measures removing the `callableSchema` forwarding closure.
[ABSTRACT-VECTORS.md](ABSTRACT-VECTORS.md) compares the new abstract constructors with concrete vectors.

See [FINDINGS.md](FINDINGS.md) for the original ablation results. The current baseline includes the two behavior-preserving optimizations; `previous` reverses both in memory for an apples-to-apples comparison.

Run from the repository root with Node 24.2+ and installed workspace dependencies:

```sh
pnpm --filter infra-benchmarks vectors
```

This prints nanoseconds per workload iteration and speedups relative to the current
implementation, then saves all timing samples and machine information to
`vector-results.json` in the command's working directory. A ratio above 1 means
faster. A chained operation counts as one iteration, not one allocation.

For a quick functional check (not useful performance evidence):

```sh
VECTOR_REPEATS=1 VECTOR_SAMPLES=3 VECTOR_SAMPLE_MS=2 VECTOR_WARMUP_MS=5 \
  pnpm --filter infra-benchmarks vectors
```

For a focused, longer comparison:

```sh
VECTOR_VARIANTS=baseline,previous,no-scalar-fast-path VECTOR_REPEATS=5 \
  VECTOR_SAMPLE_MS=30 VECTOR_OUTPUT=/tmp/vector-results.json \
  pnpm --filter infra-benchmarks vectors
```

## What changes

Each variant runs in a fresh process. A Node module-load hook changes the actual
`vectorImpl.ts`, `vector.ts`, or `createCallableSchema.ts` source in memory, before any TypeGPU import. No
production files are modified. Replacement counts fail loudly if source changes
invalidate an experiment. Baseline goes through the same loading and TypeScript
stripping path. The hook also adapts TypeGPU's bundler-style package JSON import
for Node.

| Variant | Isolated change |
| --- | --- |
| baseline | Current production implementation, including the scalar fast path and direct named getters. |
| no-callable-wrapper | Attach schema metadata directly to `options.normalImpl`, removing the forwarding closure from vector, scalar and matrix schemas. Diagnostic only: function identity, reflection and `this` binding can differ. |
| previous | Reverse both behavior-preserving optimizations to reproduce the implementation measured in FINDINGS.md. |
| no-swizzles | Remove the static initializer defining all 672 multi-component prototype getters. Single-component aliases stay. Swizzle workloads are **N/A**, never timed as no-ops. |
| cached-metadata | Reuse one `{ elementSchema }` object per scalar type instead of returning a fresh object from every `$internal` access. |
| no-init-coercion | Replace the nine constructor component casts with direct assignment and a zero default. Setter casts remain. |
| no-array | Replace `Array` inheritance with a minimal base storing `length`; retain component fields, indexed accessors, metadata, and swizzles. |
| indirect-named-access | Restore x/y/z/w and r/g/b/a reads through inherited numeric getters. Isolates the benefit of direct backing-field reads. |
| no-scalar-fast-path | Remove the scalar-only constructor fast path, restoring allocation/filling of the intermediate `values` array for all calls. |
| extra-payload | Add eight own numeric fields to each instance, testing sensitivity to larger instance payloads. |
| combined | Add no-swizzles, cached-metadata, no-init-coercion and no-array to the current optimized baseline. Not an additive attribution or a production proposal. |

Some variants intentionally break semantics. `no-init-coercion` skips rounding,
clamping, finite-number validation, and boolean conversion (zero defaults are
numeric). `no-array` removes Array identity, methods and iteration.
`no-swizzles` removes part of the API. These measure possible cost, not safe
drop-in replacements. The benchmark exercises numeric CPU vectors only.

## Workloads and measurement

- Public vec2/3/4 creation, direct Vec3fImpl construction, zero, splat, copy and
  composition constructors; fractional signed/unsigned/half inputs; mixed types.
- Abstract `d.vec2/3/4` construction, retaining JS numbers in non-Array instances.
- `std.add`, `std.normalize`, a multiply/add chain, manual component addition,
  manual reversal, swizzle reversal, and construction from two swizzles.
- Named and numeric component reads/writes, plus `std.dot`, using existing vectors.
- Separate retained heap deltas for 100,000 vec3f and abstract vec3 instances, including their reference arrays.
  This does not measure transient allocation volume or peak memory.

Defaults: three independent processes per variant, 75 ms warmup per workload,
15 samples of at least 15 ms, batches of 256 iterations. Variant order rotates
between rounds. The table uses the median of the three process medians; raw
samples allow examination of variance and outliers. GC runs before each measured
workload, never explicitly within its timing; natural GC remains part of the
cost. Heap measurements run separately after timing.

Allocations escape into a fixed retained ring, consumed after timing. Read-only
workloads consume scalar results. Inputs vary where appropriate; setup and input
allocation are outside timing. All variants use the same workload functions and
retention overhead. Workloads share a process within a variant, so JIT history
and polymorphism are part of this harness; use results as comparative evidence,
not universal intrinsic instruction costs. Startup/swizzle-registration time is
excluded. The harness checks selected construction, arithmetic, metadata,
swizzle, payload and Array invariants before timing.

Fractional workloads and normalization intentionally produce different values
when coercion is disabled. Their ratios include resulting representation/JIT
effects as well as the work removed. Disabling a feature may also affect other
workloads indirectly. Small differences should be treated as noise until they
repeat across processes and machines. Results here describe Node/V8, not every
browser or JavaScript engine.

## Source findings

- Swizzles are inherited, not hundreds of properties allocated per instance.
  Accessing a swizzle does allocate a new vector, and re-casts its components.
- A vec3f owns `length`, `e0`, `e1`, `e2`. Kind, schema, constructor selectors and
  `$internal` are inherited. The metadata getter creates a temporary object on
  each call; an optimizing engine may eliminate that allocation.
- `super(3)` creates an Array with component storage held separately in named
  fields. Numeric indices are prototype accessors. The previous implementation added another
  accessor layer for named reads (`x -> this[0] -> e0`); these now read backing
  fields directly.
- Each initialized component does `castElement() -> $internal -> elementSchema`,
  then calls the scalar schema wrapper, including validation and conversion.
  vec2/vec3 named setters also cast before calling numeric setters, which cast
  again; vec4 named setters delegate without that extra cast.
- Public construction wraps `cpuConstruct`. Scalar-only calls now validate arity
  and delegate directly to the implementation constructor, which still casts
  components. Vector arguments retain the intermediate `values` array,
  flattening and validation. The direct-constructor workload separates the
  public constructor path from vector allocation.
- Standard operations introduce dispatch/wrapper costs and often allocate
  vectors through those public constructors. Chained operations compound that
  overhead.

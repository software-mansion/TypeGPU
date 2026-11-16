<div align="center">

# @typegpu/algorithm

</div>

GPU sorting, scanning and compaction algorithms for TypeGPU. Sorts `u32`, `i32`
and `f32` storage buffers, optionally reordering a payload buffer alongside the
keys, scans and compacts buffers of scalars, vectors or structs, and composes
with your own command encoders and compute passes.

## Radix Sort

A stable LSD radix sort, and the fastest option here. Keys are ordered by the
natural order of their type.

```ts
import { tgpu, d } from 'typegpu';
import { createRadixSorter } from '@typegpu/algorithm';

const root = await tgpu.init();
const keys = root.createBuffer(d.arrayOf(d.f32, 100_000), data).$usage('storage');

const sorter = createRadixSorter(root, keys);
await sorter.initAsync(); // optional: avoid lazy compilation on the first run
sorter.run();
sorter.destroy();
```

With a payload (e.g. sorting indices by distance) and descending order:

```ts
const indices = root.createBuffer(d.arrayOf(d.u32, 100_000), idx).$usage('storage');

const sorter = createRadixSorter(root, keys, {
  direction: 'descending',
  values: indices,
});
```

Every 8 key bits cost one pass over the data. When the keys lie in a known
range, `range` cuts the number of passes. Integer keys are offset so the range
starts at 0 and `keyBits` defaults to the bits the range needs. Float keys are
quantized to `keyBits` buckets (32 unless given), and keys in the same bucket
keep their input order:

```ts
const cells = createRadixSorter(root, cellIds, { range: [0, gridCells - 1], values: indices });
const depths = createRadixSorter(root, depth, { range: [near, far], keyBits: 16, values: indices });
```

Any order that can be expressed as a monotone map from the key to a `u32` is a
radix sort. `key` receives the raw key, its result is sorted numerically, and
`keyBits` counts the low bits of that result. `sortKey` returns the map a sorter
uses, for the same order in a comparator or a custom kernel:

```ts
import { d, std } from 'typegpu';
import { createRadixSorter, sortKey } from '@typegpu/algorithm';

const ids = root.createBuffer(d.arrayOf(d.u32, 100_000), idData).$usage('storage');

const options = { key: std.reverseBits, direction: 'descending' } as const;
const sorter = createRadixSorter(root, ids, options);
const key = sortKey(d.u32, options);
```

By default the sort happens in place. Pass `out` buffers to leave the inputs
untouched, which also avoids a copy when the number of passes is odd:

```ts
const sorter = createRadixSorter(root, ids, {
  keyBits: 8,
  values: indices,
  out: { keys: sortedIds, values: sortedIndices },
});
```

All GPU resources are created once in `createRadixSorter`, so `run()` only
records dispatches and is cheap to call every frame.

For `f32` keys, -0 and +0 compare equal.

## Bitonic Sort

Sorts with an arbitrary comparator, for orders that are not a monotone key map.
Slower than radix sort and not stable. Arrays with non-power-of-2 lengths are padded
automatically, for keys and values alike.

```ts
import { createBitonicSorter } from '@typegpu/algorithm';

const sorter = createBitonicSorter(root, keys);
sorter.run();
```

Custom comparator (descending):

```ts
const sorter = createBitonicSorter(root, keys, {
  compare: (a, b) => { 'use gpu'; return a > b; },
  values: indices,
});
```

## Prefix Scan

An exclusive work-efficient prefix scan with any associative operation, which
need not be commutative. Elements can be scalars, vectors, matrices or structs
of up to 1024 bytes (`f16` elements need the `shader-f16` feature). A plan allocates its scratch buffers and bind
groups up front, so `run()` only records dispatches:

```ts
import { createPrefixScan } from '@typegpu/algorithm';
import { std } from 'typegpu';

const plan = createPrefixScan(root, buffer, { operation: std.add, identityElement: 0 });
await plan.initAsync(); // optional
plan.run(); // scans `buffer` in place, any number of times
plan.destroy();

const total = createPrefixScan(root, buffer, {
  operation: std.add,
  identityElement: 0,
  reduceOnly: true,
});
total.run();
total.resultBuffer; // single-element buffer owned by the plan
```

Plans over `f32`, `u32` or `i32` share pipelines when they have the same
operation, identity element and element type; plans over other element types
each build their own. For one-off work the free functions create a plan, run it and
release the scratch buffers:

```ts
import { prefixScan, reduce } from '@typegpu/algorithm';

prefixScan(root, buffer, { operation: std.add, identityElement: 0 }); // in place
const total = reduce(root, buffer, { operation: std.max, identityElement: -1e30 }); // caller owns
```

Note: passing `-2147483648` (i32 minimum) as `identityElement` currently
generates WGSL that does not compile. Use `-2147483647` instead.

Struct elements take a `'use gpu'` function as the operation. Here every element
is a map `x -> a * x + b`, and the scan composes them in order:

```ts
const Affine = d.struct({ a: d.f32, b: d.f32 });
const buffer = root.createBuffer(d.arrayOf(Affine, count)).$usage('storage');

prefixScan(root, buffer, {
  operation: (f, g) => {
    'use gpu';
    return Affine({ a: g.a * f.a, b: g.a * f.b + g.b });
  },
  identityElement: { a: 1, b: 0 },
});
```

## Chunked Scan

An inclusive scan whose elements are computed on the fly instead of being
stored, for recurrences such as `x[i] = a[i] * x[i - 1] + b[i]`. `element`
builds an element from your own resources, and `emit` receives everything up to
and including that element combined. The scratch memory is one element per chunk.

```ts
import { createChunkedScan } from '@typegpu/algorithm';

const plan = createChunkedScan(root, {
  elementType: Affine,
  operation: (f, g) => {
    'use gpu';
    return Affine({ a: g.a * f.a, b: g.a * f.b + g.b });
  },
  identityElement: { a: 1, b: 0 },
  rows: channels, // independent sequences, defaults to 1
  length,
  element: (row, index) => {
    'use gpu';
    return Affine({ a: a.$[index * channels + row], b: b.$[index * channels + row] });
  },
  emit: (row, index, prefix) => {
    'use gpu';
    x.$[index * channels + row] = prefix.b; // the value reached from x = 0
  },
});
plan.run();
```

## Stream Compaction

Select, partition, unique and run-length encoding, built as flags, an exclusive
scan of the flags and a scatter. Elements can be scalars, vectors, matrices or
structs, and the output keeps their original order. The number of selected
elements (or runs) ends up in `countBuffer`, a `u32` GPU buffer, so later passes
can use it without a readback. Output buffers need room for every input element.

```ts
import { createSelect } from '@typegpu/algorithm';

const Particle = d.struct({ position: d.vec3f, life: d.f32 });
const particles = root.createBuffer(d.arrayOf(Particle, count)).$usage('storage');
const alive = root.createBuffer(d.arrayOf(Particle, count)).$usage('storage');

const plan = createSelect(root, particles, {
  predicate: (p) => {
    'use gpu';
    return p.life > 0;
  },
  out: alive,
});
plan.run();
plan.countBuffer; // number of alive particles, owned by the plan
```

`createPartition` takes the same options and writes the rejected elements after
the selected ones. Both parts keep their input order, so the partition is
stable.

`createUnique` keeps the first element of every run of equal neighbours, and
`createRunLengthEncode` also writes every run's length. `equal` defaults to `==`
for scalars (so -0 and +0 are equal and every NaN is a run of its own) and to
`std.allEq` for vectors. Other elements need an `equal` function:

```ts
import { createRunLengthEncode, createUnique } from '@typegpu/algorithm';

const deduplicated = createUnique(root, sortedIds, { out: uniqueIds });

// `entries` is sorted by cell: an array of d.struct({ cell: d.u32, particle: d.u32 })
const runs = createRunLengthEncode(root, entries, {
  equal: (a, b) => {
    'use gpu';
    return a.cell === b.cell;
  },
  out: { values: firstInCell, lengths: cellSizes },
  countBuffer: cellCount, // optional: a count buffer of your own
});
```

A plan records two dispatches plus those of the scan, and run-length encoding
one more. The one-shot `select`, `partition`, `unique` and `runLengthEncode`
helpers run a plan once, release its scratch buffers and return the count
buffer, which the caller then owns.

## Composing with your own passes

Every `run()`, on sorters, scan and compaction plans alike, accepts an `encoder` or `pass`
to record the work into instead of submitting on its own. Both raw WebGPU and
TypeGPU encoders and passes are accepted:

```ts
const encoder = root.createCommandEncoder();

sorter.run({ encoder }); // records, does not submit
// ... encode more work ...
encoder.submit();

// or straight into an open compute pass:
const pass = encoder.beginComputePass({ timestampWrites });
sorter.run({ pass });
pass.end();
```

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).

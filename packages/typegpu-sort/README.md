<div align="center">

# @typegpu/sort

</div>

GPU sorting and scanning algorithms for TypeGPU. Sorts and scans `u32`, `i32` and
`f32` storage buffers, optionally reordering a payload buffer alongside the keys,
and composes with your own command encoders and compute passes.

## Radix Sort

A stable LSD radix sort, and the fastest option here. Keys are ordered by the
natural order of their type.

```ts
import { tgpu, d } from 'typegpu';
import { createRadixSorter } from '@typegpu/sort';

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
range, `range` skips the passes the range does not need. Integer keys are offset
so the range starts at 0, float keys are quantized to `keyBits` buckets, and
keys in the same bucket keep their input order:

```ts
const cells = createRadixSorter(root, cellIds, { range: [0, gridCells - 1], values: indices });
const depths = createRadixSorter(root, depth, { range: [near, far], keyBits: 16, values: indices });
```

Any order that can be expressed as a monotone map from the key to a `u32` is a
radix sort. `key` receives the raw key, its result is sorted numerically, and
`keyBits` counts the low bits of that result. `sortKey` returns the map a sorter
uses, for the same order in a comparator or a custom kernel:

```ts
const options = { key: std.reverseBits, direction: 'descending' };
const sorter = createRadixSorter(root, keys, options);
const key = sortKey(d.u32, options);
```

By default the sort happens in place. Pass `out` buffers to leave the inputs
untouched, which also avoids a copy when the number of passes is odd:

```ts
const sorter = createRadixSorter(root, keys, {
  keyBits: 8,
  values: indices,
  out: { keys: sortedKeys, values: sortedIndices },
});
```

All GPU resources are created once in `createRadixSorter`, so `run()` only
records dispatches and is cheap to call every frame.

For `f32` keys, -0 and +0 compare equal.

## Bitonic Sort

Sorts with an arbitrary comparator, for orders that are not a monotone key map.
Slower than radix sort. Arrays with non-power-of-2 lengths are padded
automatically, for keys and values alike.

```ts
import { createBitonicSorter } from '@typegpu/sort';

const sorter = createBitonicSorter(root, keys);
sorter.run();
```

Custom comparator (descending):

```ts
const sorter = createBitonicSorter(root, keys, {
  compare: (a, b) => { 'use gpu'; return a > b; },
  paddingValue: 0, // must sort to the end, so the minimum value for descending
  values: indices,
});
```

## Prefix Scan

An exclusive work-efficient prefix scan over `f32`, `u32` or `i32` buffers,
with any associative operation. A plan allocates its scratch buffers and bind
groups up front, so `run()` only records dispatches:

```ts
import { createPrefixScan } from '@typegpu/sort';
import * as std from 'typegpu/std';

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

Pipelines are shared between plans with the same operation, identity element
and element type. For one-off work the free functions create a plan, run it and
release the scratch buffers:

```ts
import { prefixScan, reduce } from '@typegpu/sort';

prefixScan(root, buffer, { operation: std.add, identityElement: 0 }); // in place
const total = reduce(root, buffer, { operation: std.max, identityElement: -1e30 }); // caller owns
```

Note: passing `-2147483648` (i32 minimum) as `identityElement` currently
generates WGSL that does not compile. Use `-2147483647` instead.

## Composing with your own passes

Every `run()`, on sorters and scan plans alike, accepts an `encoder` or `pass`
to record the work into instead of submitting on its own. Both raw WebGPU and
TypeGPU encoders and passes are accepted:

```ts
const encoder = root['~unstable'].createCommandEncoder();

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

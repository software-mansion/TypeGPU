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

All GPU resources are created once in `createRadixSorter`, so `run()` only
records dispatches and is cheap to call every frame.

For `f32` keys sorted ascending, NaNs with a cleared sign bit sort after
+Infinity and NaNs with a set sign bit sort before -Infinity.

## Bitonic Sort

Sorts with an arbitrary comparator, which radix sort cannot do. Slower than
radix sort. Arrays with non-power-of-2 lengths are padded automatically.

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
});
```

The bitonic sorter also accepts a `values` payload buffer for power-of-two input
sizes, swapped alongside the keys. Use radix sort for arbitrary-length numeric
key/payload pairs.

## Prefix Scan

An exclusive work-efficient prefix scan over `f32` (default), `u32` or `i32`
buffers, with any associative operation.

```ts
import { prefixScan, scan } from '@typegpu/sort';
import * as std from 'typegpu/std';

// Full prefix scan (in place)
const result = prefixScan(root, { inputBuffer, operation: std.add, identityElement: 0 });

// Reduction only (returns a single-element buffer with the aggregate)
const total = scan(root, { inputBuffer, operation: std.add, identityElement: 0 });

// Integer scan
const sums = prefixScan(root, {
  inputBuffer: u32Buffer,
  operation: std.add,
  identityElement: 0,
});
```

For repeated scans of the same buffer, prepare a plan once. All scratch buffers
and bind groups are allocated up front and `run()` only records dispatches:

```ts
import { createPrefixScanComputer } from '@typegpu/sort';

const computer = createPrefixScanComputer(root, {
  operation: std.add,
  identityElement: 0,
  dataType: d.u32,
});
const plan = computer.prepare(inputBuffer);

plan.run(); // any number of times
plan.destroy();
```

Note: passing `-2147483648` (i32 minimum) as `identityElement` currently
generates WGSL that does not compile. Use `-2147483647` instead.

## Composing with your own passes

Every `run()`, on sorters and scan plans alike, accepts an `encoder` or `pass`
to record the work into instead of submitting on its own:

```ts
const encoder = root.device.createCommandEncoder();

sorter.run({ encoder }); // records, does not submit
// ... encode more work ...
root.device.queue.submit([encoder.finish()]);

// or straight into an open compute pass:
const pass = encoder.beginComputePass();
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

<div align="center">

# @typegpu/sort

</div>

GPU sorting and scanning algorithms for TypeGPU. Sorts and scans `u32`, `i32` and
`f32` storage buffers, optionally reordering a payload buffer alongside the keys,
and composes with your own command encoders and compute passes.

## Radix Sort

The fast path — a stable 4-pass LSD radix sort. Keys are ordered by the natural
order of their type (i32 and f32 keys are handled via order-preserving bit
transforms; the buffers themselves are never transformed). When the root has the
`subgroups` feature enabled, a subgroup-ballot scatter is selected automatically
at creation time; otherwise a portable fallback is used.

```ts
import { tgpu, d } from 'typegpu';
import { createRadixSorter } from '@typegpu/sort';

const root = await tgpu.init({
  device: { optionalFeatures: ['subgroups'] },
});
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

All internal buffers, bind groups and pipelines are created once in
`createRadixSorter` — `run()` only records dispatches, so it is safe (and cheap)
to call every frame.

For f32 keys, NaNs sort after +Infinity when ascending.

## Bitonic Sort

Sorts with an arbitrary comparator — the bitonic sorter's advantage over radix
(which is limited to the natural order of the key type, but is considerably
faster). Arrays with non-power-of-2 lengths are padded automatically.

```ts
import { createBitonicSorter } from '@typegpu/sort';

const sorter = createBitonicSorter(root, keys);
sorter.run();
```

Custom comparator (descending):

```ts
const sorter = createBitonicSorter(root, keys, {
  compare: (a, b) => { 'use gpu'; return a > b; },
  paddingValue: 0, // must sort to the end — use the minimum value for descending
});
```

The bitonic sorter also accepts a `values` payload buffer, swapped alongside the
keys.

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
  dataType: d.u32,
});
```

For repeated scans of the same buffer (e.g. per frame), prepare a plan once —
all scratch buffers and bind groups are allocated up front and `run()` only
records dispatches:

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
generates WGSL that does not compile — use `-2147483647` instead.

## Composing with your own passes

Sorting is rarely standalone. Every `run()` (sorters and scan plans alike)
accepts an `encoder` or `pass` to record the work into your frame instead of
submitting on its own:

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

## GPU timing

With the `timestamp-query` feature enabled (not combinable with `pass`):

```ts
const querySet = root.createQuerySet('timestamp', 2);
sorter.run({ querySet });
querySet.resolve();
const [start, end] = await querySet.read();
const gpuTimeMs = Number(end - start) / 1_000_000;
```

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).

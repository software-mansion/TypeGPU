<div align="center">

# @typegpu/algorithm

</div>

GPU sorting and scanning algorithms for TypeGPU. Sorts and scans `u32`, `i32` and
`f32` storage buffers, optionally reordering a payload buffer alongside the keys,
and records into your own compute passes.

Every algorithm is a module with the same shape:

- `define(root, options)` builds the shaders and pipelines. Options are only what
  changes the shader (key type, comparator, ...), so one definition serves buffers
  of every size.
- `instantiate(root, definition, io)` allocates scratch buffers and bind groups
  for specific buffers.
- `defineAndInstantiate(root, options, io)` does both.
- `instance.step(pass)` records the whole algorithm into a compute pass. It never
  ends the pass or submits.
- `instance.initAsync()` / `initSync()` compile the pipelines ahead of time
  (optional), `instance.destroy()` frees what `instantiate` created.

## Radix Sort

A stable LSD radix sort, and the fastest option here. Keys are ordered by the
natural order of their type.

```ts
import { tgpu, d } from 'typegpu';
import { radixSort } from '@typegpu/algorithm';

const root = await tgpu.init();
const keys = root.createBuffer(d.arrayOf(d.f32, 100_000), data).$usage('storage');

const sorter = radixSort.defineAndInstantiate(root, { keyType: d.f32 }, { keys });
await sorter.initAsync(); // optional: avoid lazy compilation on the first use

const encoder = root.createCommandEncoder();
const pass = encoder.beginComputePass();
sorter.step(pass);
pass.end();
encoder.submit();

sorter.destroy();
```

With a payload (e.g. sorting indices by distance) and descending order:

```ts
const indices = root.createBuffer(d.arrayOf(d.u32, 100_000), idx).$usage('storage');

const sorter = radixSort.defineAndInstantiate(
  root,
  { keyType: d.f32, valueType: d.u32, direction: 'descending' },
  { keys, values: indices },
);
```

Every 8 key bits cost one pass over the data. When the keys lie in a known
range, `range` cuts the number of passes. Integer keys are offset so the range
starts at 0 and `keyBits` defaults to the bits the range needs. Float keys are
quantized to `keyBits` buckets (32 unless given), and keys in the same bucket
keep their input order:

```ts
const byCell = radixSort.define(root, {
  keyType: d.u32,
  valueType: d.u32,
  range: [0, gridCells - 1],
});
const byDepth = radixSort.define(root, {
  keyType: d.f32,
  valueType: d.u32,
  range: [near, far],
  keyBits: 16,
});
```

Any order that can be expressed as a monotone map from the key to a `u32` is a
radix sort. `key` receives the raw key, its result is sorted numerically, and
`keyBits` counts the low bits of that result. `radixSort.sortKey` returns the map
a sort uses, for the same order in a comparator or a custom kernel:

```ts
import { d, std } from 'typegpu';
import { radixSort } from '@typegpu/algorithm';

const options = { keyType: d.u32, key: std.reverseBits, direction: 'descending' } as const;
const definition = radixSort.define(root, options);
const key = radixSort.sortKey(d.u32, options); // a 'use gpu' function
```

By default the sort happens in place. Pass `out` buffers to leave the inputs
untouched, which also avoids a copy when the number of passes is odd:

```ts
const sorter = radixSort.instantiate(root, definition, {
  keys: ids,
  values: indices,
  out: { keys: sortedIds, values: sortedIndices },
});
```

For `f32` keys, -0 and +0 compare equal.

## Bitonic Sort

Sorts with an arbitrary comparator, for orders that are not a monotone key map.
Slower than radix sort and not stable. Arrays with non-power-of-2 lengths are padded
automatically, for keys and values alike. The definition holds a variant for padded
and unpadded sizes, and the instance runs the fastest one `root.device` supports.

```ts
import { bitonicSort } from '@typegpu/algorithm';

const sorter = bitonicSort.defineAndInstantiate(root, { keyType: d.u32 }, { keys });
sorter.step(pass);
```

Custom comparator (descending):

```ts
const sorter = bitonicSort.defineAndInstantiate(
  root,
  {
    keyType: d.u32,
    valueType: d.u32,
    compare: (a, b) => {
      'use gpu';
      return a > b;
    },
  },
  { keys, values: indices },
);
```

## Prefix Scan

An exclusive work-efficient prefix scan over `f32`, `u32` or `i32` buffers,
with any associative operation. An instance allocates its scratch buffers and
bind groups up front, so `step` only records dispatches:

```ts
import { prefixScan } from '@typegpu/algorithm';
import { d, std } from 'typegpu';

const add = { elementType: d.u32, operation: std.add, identityElement: 0 };

const scan = prefixScan.defineAndInstantiate(root, add, { buffer });
scan.step(pass); // scans `buffer` in place

const total = prefixScan.defineAndInstantiate(root, { ...add, reduceOnly: true }, { buffer });
total.step(pass);
total.resultBuffer; // single-element buffer owned by the instance
```

For one-off work, `prefixScan.scan` and `prefixScan.reduce` define (cached per
`root`, operation, identity element and element type), instantiate, **submit**
the work and release the scratch buffers:

```ts
prefixScan.scan(root, buffer, { operation: std.add, identityElement: 0 }); // in place
const max = prefixScan.reduce(root, buffer, { operation: std.max, identityElement: -1e30 }); // caller owns
```

Note: passing `-2147483648` (i32 minimum) as `identityElement` currently
generates WGSL that does not compile. Use `-2147483647` instead.

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).

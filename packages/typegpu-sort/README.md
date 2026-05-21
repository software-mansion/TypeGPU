<div align="center">

# @typegpu/sort

</div>

GPU sorting and scanning algorithms for TypeGPU.

## Bitonic Sort

Sorts a `u32` storage buffer in-place. Arrays with non-power-of-2 lengths are padded automatically.

```ts
import tgpu, { d } from 'typegpu';
import { createBitonicSorter } from '@typegpu/sort';

const root = await tgpu.init();
const buffer = root.createBuffer(d.arrayOf(d.u32, 1024), data).$usage('storage');

const sorter = createBitonicSorter(root, buffer);
sorter.run();
sorter.destroy();
```

Custom comparator (descending):

```ts
const sorter = createBitonicSorter(root, buffer, {
  compare: (a, b) => { 'use gpu'; return a > b; },
  paddingValue: 0, // must sort to the end — use 0 for descending
});
```

With GPU timing (`timestamp-query` feature required):

```ts
const querySet = root.createQuerySet('timestamp', 2);
sorter.run({ querySet });
querySet.resolve();
const [start, end] = await querySet.read();
const gpuTimeMs = Number(end - start) / 1_000_000;
```

## Prefix Scan

```ts
import { prefixScan, scan } from '@typegpu/sort';
import * as std from 'typegpu/std';

// Full prefix scan
const result = prefixScan(root, { inputBuffer, operation: std.add, identityElement: 0 });

// Reduction only (returns the final aggregated value)
const total = scan(root, { inputBuffer, operation: std.add, identityElement: 0 });
```

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).

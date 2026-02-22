<div align="center">

# @typegpu/concurrent-scan

</div>

A concurrent scan module. For use in WebGPU/TypeGPU apps. Example usage:

```ts
const calcResult = prefixScan(
  root,
  {
    inputBuffer,
    operation: std.add,
    identityElement: 0,
  },
);
```

Example usage (only the greatest element + timing the shader):

```ts
// Note: 'timestamp-query' must be requested when initialising the root
const querySet = root.createQuerySet('timestamp', 2);

const calcResult = scan(
  root,
  {
    inputBuffer,
    operation: std.mul,
    identityElement: 1,
  },
  querySet,
);

querySet.resolve();
const [start, end] = await querySet.read();
const gpuTimeMs = Number(end - start) / 1_000_000;
```

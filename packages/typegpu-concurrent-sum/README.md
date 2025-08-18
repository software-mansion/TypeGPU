<div align="center">

# @typegpu/concurrent-scan

</div>

A concurrent scan module. For use in WebGPU/TypeGPU apps.\
Example usage:

```ts
const calcResult = scan(
  root,
  inputBuffer,
  { operation: std.add, identityElement: 0 },
);
```

Example usage (only the greatest element + timing the shader):

```ts
const calcResult = scan(
  root,
  inputBuffer,
  { operation: std.mul, identityElement: 1 },
  async (timeTgpuQuery) => {
    const timestamps = await timeTgpuQuery.read();
    const timeNs = timestamps[1] - timestamps[0];
    const gpuShaderTime = Number(timeNs) / 1000000;
    if (resolveTime) resolveTime(gpuShaderTime);
  },
);
```

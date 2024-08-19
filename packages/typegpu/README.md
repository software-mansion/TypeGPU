<div align="center">

![TypeGPU (light mode)](/apps/typegpu-docs/public/typegpu-logo-light.svg#gh-light-mode-only)
![TypeGPU (dark mode)](/apps/typegpu-docs/public/typegpu-logo-dark.svg#gh-dark-mode-only)

[Website](https://docs.swmansion.com/typegpu) — [Live Examples](https://docs.swmansion.com/typegpu/examples) — [Documentation](https://docs.swmansion.com/typegpu/guides/getting-started)

</div>

TypeScript library simplifying the WebGPU API and WGSL with zero-cost abstractions, type-safe data transfer and dependency injection.

## Basic Principles

**TypeGPU** introduces an alternative API for WebGPU, one that aims to be type-safe and modular, but under the hood is still WebGPU.

The `wgsl` tagged function, and functions attached to it (`wgsl.fn`, `wgsl.var`, etc.) create descriptions of WebGPU resources.

```ts
import { wgsl } from 'typegpu';

const snippet = wgsl`1 + 5`; // a piece of code
const variable = wgsl.var(u32, snippet); // a variable of type u32 set to `1 + 5`
const buffer = wgsl.buffer(f32, 3.14).$allowUniform(); // a uniform buffer
```

Functions and code snippets can declare their dependencies by just using other resources.

```ts
// execute.ts

const executionsVar = wgsl.var(u32, 0);

// using `executeFn` in a program will automatically
// declare `executionsVar`.
export const executeFn = wgsl.fn`() {
  // We are in WGSL land, this runs on the GPU.
  ${executionsVar}++;
}`;

export const getExecutionsFn = wgsl.fn`() -> u32 {
  return ${executionsVar};
}`
```

Only those resources that are used by our minimal runtime get defined in the WGSL code sent to the GPU.

```ts
import { createRuntime } from 'typegpu';
import { executeFn, getExecutionsFn } from './execute';

const runtime = await createRuntime();

// Because we used `executeFn`, a variable that
// matches what is described by `executionsVar` will
// be generated.
const pipeline = runtime.makeComputePipeline({
  code: wgsl`
    ${executeFn}();
    ${executeFn}();
    ${executeFn}();
    // 'count' should be equal to 3
    let count = ${getExecutionsFn}();
  `,
});

pipeline.execute();
```

## What's next?

Find out more on the [official docs](https://docs.swmansion.com/typegpu/guides/getting-started)!

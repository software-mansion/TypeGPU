# @typegpu/js2tgsl

A set of utilities for transforming JavaScript code into TGSL (TypeGPU Shader Language). Used by [**TypeGPU**](https://docs.swmansion.com/typegpu) to run JavaScript on the GPU.

## Basic principles

```ts
const double = tgpu.fn([f32], f32).implement((v) => 2 * v);

const foo = tgpu
  .fn([f32, f32], f32)
  .implement((a, b) => {
    return a + b + double(a);
  });

```

`@typegpu/js2tgsl` is responsible for transforming the function bodies of `tgpu.fn` declarations into an abstract syntax tree, gathering external dependencies and inferring types of expressions.

```ts
`(a, b) => {
  return a + b + double(a);
}`
```

This can then be used to generate JS code with a build plugin:

```ts
const double = tgpu.fn([f32], f32).implement((v) => 2 * v);

const foo = tgpu
  .fn([f32, f32], f32)
  .implement((a, b) => {
    return a + b + double(a);
  });

// Applying a debug label to the function
foo.$name('foo');

// Assigning the transpiled code
foo.__setTranspiled((ctx) => {
  const a = ctx.id('a', ctx.argTypes[0]);
  const tmp1 = double(a);

  return {
    head: ctx.wgsl(
      ($) => $`(a: ${ctx.argTypes[0]}, b: ${ctx.argTypes[1]}) -> ${ctx.returnType}`,
    ),

    body: ctx.wgsl(($) => $`\
  return a + b + ${tmp1};`);
  };
});
```

```ts
const foo = tgpu
  .fn([f32, f32], f32)
  .implement((a, b) => {
    return a + b + double(a);
  });

// Applying a debug label to the function
foo.$name('foo');

// Assigning the transpiled code
foo.__setTranspiled((ctx) => {
  // In the context of this function, we are in GPU mode.
  // (meaning all function calls produce WGSL instead of being executed in JS)

  const arg = {
    a: ctx.id('a', ctx.argTypes[0]),
    b: ctx.id('b', ctx.argTypes[1]),
  };

  const expr0 = double(arg.a);
  const s0 = ctx.wgsl`return ${arg.a} + ${arg.b} + ${expr0};`;

  return {
    head: ctx.wgsl`(a: ${arg.a.type}, b: ${arg.b.type}) -> ${ctx.returnType}`,

    body: ctx.wgsl`\
  ${s0}`,
  };
});
```

There are a couple things that a function can accept:
- An expression of a specific type.
- A readonly accessor (resources are accessors to themselves).
- A mutable accessor (resources are accessors to themselves).
- A function of a specific signature.
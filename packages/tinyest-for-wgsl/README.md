# tinyest-for-wgsl

Transforms JavaScript into its 'tinyest' form, to be used in generating equivalent (or close to) WGSL code.
Used by [**TypeGPU**](https://docs.swmansion.com/TypeGPU) to allow for shaders to be written in JS.

## Basic principles

```ts
const double = tgpu.fn([f32], f32).does((v) => 2 * v);

const foo = tgpu
  .fn([f32, f32], f32)
  .does((a, b) => {
    return a + b + double(a);
  });

```

`tinyest-for-wgsl` is responsible for transforming the function bodies of `tgpu.fn` declarations into an abstract syntax tree, gathering external dependencies and inferring types of expressions.

```ts
`(a, b) => {
  return a + b + double(a);
}`
```

This can then be used to generate JS code with a build plugin:

```ts
const foo = tgpu
  .fn([f32, f32], f32)
  .does((a, b) => {
    return a + b + double(a);
  })
  .$uses({ double });

// Assigning the transpiled code
foo.__ast(
  ['a', 'b'], // argument names
  // Can be injected with a simple JSON.stringify of a value that can be computed in the Vite plugin.
  [
    {
      return: {
        '+': [
          { '+': ['a', 'b']},
          { call: 'double', args: ['a']},
        ],
      },
    },
  ],
);
```
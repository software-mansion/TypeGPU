# tinyest-for-wgsl

Transforms JavaScript into its 'tinyest' form, to be used in generating
equivalent (or close to) WGSL code. Used by
[**TypeGPU**](https://docs.swmansion.com/TypeGPU) to allow for shaders to be
written in JS.

## Basic principles

`tinyest-for-wgsl` is responsible for transforming JS function bodies of TypeGPU
declarations (e.g., `tgpu.fn`) into an embeddable syntax tree, gathering
external names outside of the scope of the function.

```ts
`(a, b) => {
  return a + b + double(a);
}`;
```

This can then be used to generate the following Embeddable Syntax Tree:

```js
// Can be injected with a simple JSON.stringify of a value that can be computed in the Rollup plugin.
{
  b: [{ r: { x: [{ x: ['a', '+', 'b'] }, '+', { f: ['double', ['a']] }] } }];
}
```

## tinyest is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=tinyest&utm_medium=readme).

<div align="center">

![TypeGPU (light mode)](/apps/typegpu-docs/public/typegpu-logo-light.svg#gh-light-mode-only)
![TypeGPU (dark mode)](/apps/typegpu-docs/public/typegpu-logo-dark.svg#gh-dark-mode-only)

[Website](https://docs.swmansion.com/TypeGPU) —
[Documentation](https://docs.swmansion.com/TypeGPU/getting-started)

</div>

**TypeGPU** is a modular and open-ended toolkit for WebGPU, with advanced type
inference and the ability to write shaders in TypeScript.

```ts
const neighborhood = (a: number, r: number) => {
  'use gpu';
  return d.vec2f(a - r, a + r);
};

//
// #1) Can be called in JS
//
const range = neighborhood(1.1, 0.5);
//    ^? d.v2f

//
// #2) Used to generate WGSL
//
const main = () => {
  'use gpu';
  return neighborhood(1.1, 0.5);
};

const wgsl = tgpu.resolve([main]);
//    ^? string

//
// #3) Executed on the GPU (generates WGSL underneath)
//
root
  .createGuardedComputePipeline(main)
  .dispatchThreads();
```

## Documentation

We created a set of guides and tutorials to get you up and running fast. Check
out our [Official Docs](https://docs.swmansion.com/TypeGPU/getting-started)!

## What's next?

- [Join the Software Mansion Community Discord](https://discord.gg/8jpfgDqPcM)
  to chat about TypeGPU or other Software Mansion libraries.

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).

<div align="center">

![TypeGPU (light mode)](./apps/typegpu-docs/public/typegpu-logo-light.svg#gh-light-mode-only)
![TypeGPU (dark mode)](./apps/typegpu-docs/public/typegpu-logo-light.svg#gh-dark-mode-only)

[Website](https://docs.swmansion.com/typegpu) — [Live Examples](https://docs.swmansion.com/typegpu/examples) — [Documentation](https://docs.swmansion.com/typegpu/guides/getting-started)

</div>

**TypeGPU** is a TypeScript library simplifying the WebGPU API and WGSL with zero-cost abstractions, type-safe data transfer and dependency injection.

## Addressed problems

- Minimizing mismatches between what we write to buffers on the CPU and what we receive on the GPU by generating WGSL types from typed-binary schemas.
- Ability to compose code blocks in a reusable way, opening up the possibility of WebGPU/WGSL JavaScript libraries that expose utility code.
- Automatically resolves conflicts in variable names, function names and binding indices.
- Allows to easily define memory shared between JS and WebGPU.

<div align="center">

![TypeGPU (light mode)](./apps/typegpu-docs/public/typegpu-logo-light.svg#gh-light-mode-only)
![TypeGPU (dark mode)](./apps/typegpu-docs/public/typegpu-logo-dark.svg#gh-dark-mode-only)

[Website](https://docs.swmansion.com/TypeGPU) — [Documentation](https://docs.swmansion.com/TypeGPU/getting-started)

</div>

**TypeGPU** is a TypeScript library that enhances the WebGPU API, allowing resource management in a type-safe, declarative way.

<div align="center">
<video width="512" autoplay muted loop src="https://github.com/user-attachments/assets/5bca716d-477d-44a1-a839-5df0c8d9044c"></video>
</div>

## Documentation

We created a set of guides and tutorials to get you up and running fast. Check out our [Official Docs](https://docs.swmansion.com/TypeGPU/getting-started)!

## What's next?

- [Join the Software Mansion Community Discord](https://discord.gg/8jpfgDqPcM) to chat about TypeGPU or other Software Mansion libraries.

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with experience in building web and mobile apps. We are Core React Native Contributors and experts in dealing with all kinds of React Native issues. We can help you build your next dream product – [Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).

## Repository structure
**Packages**:
- [packages/typegpu](/packages/typegpu) - the core library
- [packages/tgpu-gen](/packages/tgpu-gen) - CLI tool for automatic TypeGPU code generation
- [packages/tgpu-jit](/packages/tgpu-jit) - Just-In-Time transpiler for TypeGPU
- [packages/tgpu-wgsl-parser](/packages/tgpu-wgsl-parser) - WGSL code parser
- [packages/tinyest](/packages/tinyest) - compact JavaScript AST for transpilation
- [packages/tinyest-for-wgsl](/packages/tinyest-for-wgsl) - WGSL to tinyest parser
- [packages/unplugin-typegpu](/packages/unplugin-typegpu) - build plugins for TypeGPU
- ~~[packages/rollup-plugin](/packages/rollup-plugin) - rollup plugin for TypeGPU~~ (replaced by unplugin-typegpu)
- [packages/tgpu-dev-cli](/packages/tgpu-dev-cli) - some TypeGPU development tools

**Apps**:
- [apps/typegpu-docs](/apps/typegpu-docs) - the documentation, examples and benchmarks webpage

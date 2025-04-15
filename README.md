<div align="center">

![TypeGPU (light mode)](./apps/typegpu-docs/public/typegpu-logo-light.svg#gh-light-mode-only)
![TypeGPU (dark mode)](./apps/typegpu-docs/public/typegpu-logo-dark.svg#gh-dark-mode-only)

[Website](https://docs.swmansion.com/TypeGPU) — [Documentation](https://docs.swmansion.com/TypeGPU/getting-started)

</div>

**TypeGPU** is a TypeScript library that enhances the WebGPU API, allowing resource management in a type-safe, declarative way.

<div align="center">
<video width="512" autoplay muted loop playsinline src="https://github.com/user-attachments/assets/5bca716d-477d-44a1-a839-5df0c8d9044c"></video>

<!-- automd:badges color="plum" license name="typegpu" bundlephobia no-npmDownloads -->

[![npm version](https://img.shields.io/npm/v/typegpu?color=plum)](https://npmjs.com/package/typegpu)
[![bundle size](https://img.shields.io/bundlephobia/minzip/typegpu?color=plum)](https://bundlephobia.com/package/typegpu)
[![license](https://img.shields.io/github/license/software-mansion/TypeGPU?color=plum)](https://github.com/software-mansion/TypeGPU/blob/main/LICENSE)

<!-- /automd -->

</div>

## Documentation

We created a set of guides and tutorials to get you up and running fast. Check out our [Official Docs](https://docs.swmansion.com/TypeGPU/getting-started)!

## What's next?

- [Join the Software Mansion Community Discord](https://discord.gg/8jpfgDqPcM) to chat about TypeGPU or other Software Mansion libraries.

## Projects using TypeGPU

<!-- automd:file src="./projects-using-typegpu.md" -->

- [Chaos Master](https://chaos-master.vercel.app) by deluksic & Komediruzecki
- [Apollonian Circles](https://deluksic.github.io/apollonian-circles/) by deluksic
- [Strange Forms](https://github.com/loganzartman/strangeforms) by Logan Zartman
- [WebGPU Stable Fluids](https://github.com/loganzartman/webgpu-stable-fluids) by Logan Zartman
- [Visual timer: Calm Jar](https://apps.apple.com/us/app/visual-timer-calm-jar/id6741375962) by Nathan Schmidt

<!-- /automd -->

## Repository structure
**Packages**:
- [packages/typegpu](/packages/typegpu) - The core library.
- [packages/unplugin-typegpu](/packages/unplugin-typegpu) - Build plugins for TypeGPU.
- [packages/tgpu-gen](/packages/tgpu-gen) - CLI tool for automatic TypeGPU code generation.
- [packages/tgpu-jit](/packages/tgpu-jit) - Just-In-Time transpiler for TypeGPU.
- [packages/tinyest](/packages/tinyest) - Type definitions for a JS embeddable syntax tree.
- [packages/tinyest-for-wgsl](/packages/tinyest-for-wgsl) - Transforms JavaScript into its *tinyest* form, to be used in generating equivalent (or close to) WGSL code.
- [packages/tgpu-wgsl-parser](/packages/tgpu-wgsl-parser) - WGSL code parser.
- [packages/tgpu-dev-cli](/packages/tgpu-dev-cli) - Development tools for packages in the monorepo.

**Apps**:
- [apps/typegpu-docs](/apps/typegpu-docs) - The documentation, examples and benchmarks webpage.

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with experience in building web and mobile apps. We are Core React Native Contributors and experts in dealing with all kinds of React Native issues. We can help you build your next dream product – [Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).

<!-- automd:contributors author="software-mansion" -->

Made by [@software-mansion](https://github.com/software-mansion) and [community](https://github.com/software-mansion/TypeGPU/graphs/contributors) 💛
<br><br>
<a href="https://github.com/software-mansion/TypeGPU/graphs/contributors">
<img src="https://contrib.rocks/image?repo=software-mansion/TypeGPU" />
</a>

<!-- /automd -->

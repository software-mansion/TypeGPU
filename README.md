<div align="center">

![TypeGPU (light mode)](./apps/typegpu-docs/public/typegpu-logo-light.svg#gh-light-mode-only)
![TypeGPU (dark mode)](./apps/typegpu-docs/public/typegpu-logo-dark.svg#gh-dark-mode-only)

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
root.createGuardedComputePipeline(main).dispatchThreads();
```

<div align="center">

<!-- automd:badges color="plum" license name="typegpu" bundlephobia no-npmDownloads -->

[![npm version](https://img.shields.io/npm/v/typegpu?color=plum)](https://npmjs.com/package/typegpu)
[![bundle size](https://img.shields.io/bundlephobia/minzip/typegpu?color=plum)](https://bundlephobia.com/package/typegpu)
[![license](https://img.shields.io/github/license/software-mansion/TypeGPU?color=plum)](https://github.com/software-mansion/TypeGPU/blob/main/LICENSE)

<!-- /automd -->

</div>

<br>
<br>

**Table of contents:**

- [:gear: TypeGPU as a foundation](#gear-typegpu-as-a-foundation)
- [:jigsaw: TypeGPU as a piece of the puzzle](#jigsaw-typegpu-as-a-piece-of-the-puzzle)
- [:book: TypeGPU for libraries](#book-typegpu-for-libraries)
- [Documentation](#documentation)
- [What's next?](#whats-next)
- [Projects using TypeGPU](#projects-using-typegpu)
- [Repository structure](#repository-structure)

## :gear: TypeGPU as a foundation

We provide an abstraction that solves the most common WebGPU hurdles, yet does
not restrict you in capability. You can granularly eject into vanilla WebGPU at
any point. This means that, when building your app with TypeGPU, lock-in is not
a concern!

The low-level nature of TypeGPU and it's mirroring of WGSL (WebGPU Shading
Language) syntax in TypeScript means that learning TypeGPU helps to learn WebGPU
itself, with fewer frustrations.

[The Getting Started and Fundamentals guides are a great starting point for new projects!](https://docs.swmansion.com/TypeGPU/getting-started/)

## :jigsaw: TypeGPU as a piece of the puzzle

Our type-safe APIs can be used together, or in isolation. This makes partial
application into existing apps just a few lines of code away, no matter the
complexity of your app!

[We wrote a comprehensive resource on ways TypeGPU can improve your existing codebase.](https://docs.swmansion.com/TypeGPU/integration/webgpu-interoperability/)

Pick and choose which parts of TypeGPU you'd like to incorporate into your
existing app!

## :book: TypeGPU for libraries

When creating a type-safe WebGPU library, one can expect to encounter at least
one of the following problems:

- Serializing/deserializing data.
- Dynamically generating parts of the WGSL shader.
- Complex type inference.

If implemented from scratch, interoperability with other libraries (ones that
have a different focus, solve different problems) can be near impossible without
going down to _untyped WebGPU land_, or copying data back to JS. Moreover, to
keep up with demand from users, they can be tempted to go out of scope of their
initial use-case, even though another library already solves that problem.

> TypeGPU can be used as an interoperability layer between use-case specific
> libraries!

Let's imagine `@xyz/gen` is a library for procedural generation using WebGPU
compute shaders, and `@abc/plot` is a library for plots and visualization using
WebGPU.

```ts
import tgpu from 'typegpu';
import gen from '@xyz/gen';
import plot from '@abc/plot';

// common root for allocating resources
const root = await tgpu.init();

const terrainBuffer = await gen.generateHeightMap(root, { ... });
//    ^? TgpuBuffer<WgslArray<WgslArray<F32>>> & StorageFlag

// ERROR: Argument of type 'TgpuBuffer<WgslArray<WgslArray<F32>>>' is
// not assignable to parameter of type 'TgpuBuffer<WgslArray<F32>>>'
plot.array1d(root, terrainBuffer);

// SUCCESS!
plot.array2d(root, terrainBuffer);
```

We can pass typed values around without the need to copy anything back to
CPU-accessible memory! Let's see an example of how we can construct a type-safe
API:

```ts
import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import { d } from 'typegpu';

// We can define schemas, or functions that return schemas...
const HeightMap = (width: number, height: number) =>
  d.arrayOf(d.arrayOf(d.f32, height), width);

// ...then infer types from them
type HeightMap = ReturnType<typeof HeightMap>;

export async function generateHeightMap(
  root: TgpuRoot,
  opts: { width: number; height: number },
): Promise<TgpuBuffer<HeightMap> & StorageFlag> {
  const buffer = root
    .createBuffer(HeightMap(opts.width, opts.height))
    .$usage('storage');

  const rawBuffer = root.unwrap(buffer); // => GPUBuffer

  // Here we can do anything we would usually do with a
  // WebGPU buffer, like populating it in a compute shader.
  // `rawBuffer` is the WebGPU resource that is backing the
  // typed `buffer` object, meaning any changes to it will
  // be visible in both.

  return buffer;
}
```

[Planning to create a WebGPU library? Reach out to us!](https://discord.gg/8jpfgDqPcM)
We'd love to work with you to enrich the ecosystem with type-safe WebGPU
utilities!

## Documentation

We created a set of guides and tutorials to get you up and running fast. Check
out our [Official Docs](https://docs.swmansion.com/TypeGPU/getting-started)!

## What's next?

- [Join the Software Mansion Community Discord](https://discord.gg/8jpfgDqPcM)
  to chat about TypeGPU or other Software Mansion libraries.

## Projects using TypeGPU

<!-- automd:file src="./projects-using-typegpu.md" -->

Libraries:

- [Vivarium](https://github.com/WonderYard/vivarium) - Modern, intuitive,
  WebGPU-powered toolkit for creating your own cellular automata
- [wayfare](https://github.com/iwoplaza/wayfare) - A modular game engine built
  on top of TypeGPU & Koota
- [typegpu-shader-canvas](https://github.com/AlexJWayne/typegpu-shader-canvas) -
  a high-level library that sets up a canvas for you, so you can focus on
  delivering pixels with TypeScript functions
- [lilgpu](https://github.com/gnlow/lilgpu) - Lil wrapper to toy with WebGPU,
  powered by TypeGPU
- [fisheye.js](https://github.com/GyeongHoKim/fisheye.js/tree/main) - A
  JavaScript library for correcting fisheye, or barrel distortion, in images in
  the browser

Apps:

- [ComfyUI](https://www.comfy.org/) - An open-source tool for creating
  generative AI
- [Chaos Master](https://chaos-master.vercel.app) by deluksic & Komediruzecki
- [Visual timer: Calm Jar](https://apps.apple.com/us/app/visual-timer-calm-jar/id6741375962)
  by Nathan Schmidt

Demos:

- [Apollonian Circles](https://deluksic.github.io/apollonian-circles/) by
  deluksic
- [Strange Forms](https://github.com/loganzartman/strangeforms) by Logan Zartman
- [WebGPU Stable Fluids](https://github.com/loganzartman/webgpu-stable-fluids)
  by Logan Zartman
- [Plasma Garden](https://alexwayne.codes/2026-01-11-plasma-garden/) by Alex
  Wayne
- [Glowout](https://alexwayne.codes/2025-12-04-glowout/) by Alex Wayne
- [MeloSkia](https://github.com/kimchouard/meloskia) - A music-game demo to
  highlight RN-Skia capabilities by Kim Chouard

<!-- /automd -->

## Repository structure

**Packages:**

- [packages/typegpu](/packages/typegpu) - The core library.
- [packages/typegpu-color](/packages/typegpu-color) - A set of color helper
  functions for use in WebGPU/TypeGPU apps.
- [packages/typegpu-noise](/packages/typegpu-noise) - A set of
  noise/pseudo-random functions for use in WebGPU/TypeGPU apps.

**Tooling:**

- [packages/unplugin-typegpu](/packages/unplugin-typegpu) - Plugin for your
  favorite bundler, enabling TypeGPU shader functions to be written in JS.
- [packages/tgpu-gen](/packages/tgpu-gen) - CLI tool for automatic TypeGPU code
  generation.

**Internals:**

- [packages/tinyest](/packages/tinyest) - Type definitions for a JS embeddable
  syntax tree.
- [packages/tinyest-for-wgsl](/packages/tinyest-for-wgsl) - Transforms
  JavaScript into its _tinyest_ form, to be used in generating equivalent (or
  close to) WGSL code.
- [packages/tgpu-wgsl-parser](/packages/tgpu-wgsl-parser) - WGSL code parser.
- [packages/tgpu-dev-cli](/packages/tgpu-dev-cli) - Development tools for
  packages in the monorepo.

**Apps**:

- [apps/typegpu-docs](/apps/typegpu-docs) - The documentation, examples and
  benchmarks webpage.
- [apps/infra-benchmarks](/apps/infra-benchmarks) - Headless benchmarks.

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).

<!-- automd:contributors author="software-mansion" -->

Made by [@software-mansion](https://github.com/software-mansion) and
[community](https://github.com/software-mansion/TypeGPU/graphs/contributors) 💛
<br><br>
<a href="https://github.com/software-mansion/TypeGPU/graphs/contributors">
<img src="https://contrib.rocks/image?repo=software-mansion/TypeGPU" />
</a>

<!-- /automd -->

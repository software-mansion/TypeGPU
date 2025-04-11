<div align="center">

![TypeGPU (light mode)](./apps/typegpu-docs/public/typegpu-logo-light.svg#gh-light-mode-only)
![TypeGPU (dark mode)](./apps/typegpu-docs/public/typegpu-logo-dark.svg#gh-dark-mode-only)

[Website](https://docs.swmansion.com/TypeGPU) — [Documentation](https://docs.swmansion.com/TypeGPU/getting-started)

</div>

**TypeGPU** is a TypeScript library that enhances the WebGPU API, allowing resource management in a type-safe, declarative way.

<div align="center">
<video width="512" autoplay muted loop playsinline src="https://github.com/user-attachments/assets/5bca716d-477d-44a1-a839-5df0c8d9044c"></video>
</div>

<br>
<br>

**Table of contents:**
- [TypeGPU for libraries](#typegpu-for-libraries)
- [TypeGPU as a foundation](#typegpu-as-a-foundation)
- [TypeGPU as an afterthought](#typegpu-as-an-afterthought)
- [Documentation](#documentation)
- [What's next?](#whats-next)
- [Repository structure](#repository-structure)

## TypeGPU for libraries

When creating a type-safe WebGPU library, one can expect to encounter at least one of the following problems:
- Serializing/deserializing data.
- Dynamically generating parts of the WGSL shader.
- Complex type inference.

If implemented from scratch, interoperability with other libraries (ones that have a different focus, solve different problems) can be near impossible without going down to *untyped WebGPU land*, or copying data back to JS. Moreover, to keep up with demand from users, they can be tempted to go out of scope of their initial use-case, even though another library already solves that problem.

> TypeGPU can be used as an interoperability layer between use-case specific libraries!

Let's imagine `@xyz/gen` is a library for procedural generation using WebGPU compute shaders, and `@abc/plot` is a library for plots and visualization using WebGPU.

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
plot.1dArray(root, terrainBuffer);

// SUCCESS!
plot.2dArray(root, terrainBuffer);
```

We can pass typed values around without the need to copy anything back to CPU-accessible memory! Lets see an example of how we can construct a type-safe API:

```ts
import type { TgpuBuffer, TgpuRoot, StorageFlag } from 'typegpu';
import * as d from 'typegpu/data';

// We can define schemas, or functions that return schemas...
const HeightMap = (width: number, height: number) =>
  d.arrayOf(d.arrayOf(d.f32, height), width);

// ...then infer types from them
type HeightMap = ReturnType<typeof HeightMap>;

export async function generateHeightMap(
  root: TgpuRoot,
  opts: { width: number, height: number },
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

## TypeGPU as a foundation



## TypeGPU as an afterthought

(...)

## Documentation

We created a set of guides and tutorials to get you up and running fast. Check out our [Official Docs](https://docs.swmansion.com/TypeGPU/getting-started)!

## What's next?

- [Join the Software Mansion Community Discord](https://discord.gg/8jpfgDqPcM) to chat about TypeGPU or other Software Mansion libraries.

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

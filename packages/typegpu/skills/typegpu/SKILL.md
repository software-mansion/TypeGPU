---
name: typegpu
description: >-
  Use when writing, debugging, reviewing or optimizing code that imports typegpu or a @typegpu/* package, or uses tgpu.*, d.* schemas, std.* or 'use gpu' functions: shaders, buffers, textures, bind groups, compute and render pipelines, command encoders, slots and accessors, React and React Native rendering (@typegpu/react), random numbers and noise (@typegpu/noise), signed distance fields (@typegpu/sdf), colour and tonemapping (@typegpu/color), 2D global illumination (@typegpu/radiance-cascades). Covers the CPU side and the shader side together, so use it even when the question names only one. TypeGPU is type-safe WebGPU in TypeScript. Not for raw WebGPU written without tgpu, standalone WGSL, or WebGL.
metadata:
  library: typegpu
---

# TypeGPU

One schema (`d.*`) is at once a GPU type, a CPU buffer layout and a TypeScript type. Functions marked `'use gpu'` are TypeScript that the build plugin `unplugin-typegpu` turns into WGSL, so shader code is type-checked and shares types with the CPU side.

This skill targets TypeGPU `0.12`. The `.d.ts` files in `node_modules/typegpu` are the exact API of the installed version; most public functions carry TSDoc with examples.

Read this file whole before writing TypeGPU code. Links are relative to this file. Every docs page has a Markdown copy: append `.md` to its URL, e.g. https://docs.swmansion.com/TypeGPU/apis/pipelines.md, and https://docs.swmansion.com/TypeGPU/llms.txt lists them all.

## Tasks

Each task names the API to use and the reference with the details.

- Start a project: `npx typegpu@latest`, or `npx typegpu@latest --enhance` in an existing Vite app; [setup](references/setup.md).
- Get a device and draw to a canvas: `tgpu.init()`, `root.configureContext({ canvas })`, `common.attachAutoResizer`; [setup](references/setup.md).
- Define data: `d.struct`, `d.arrayOf`, vectors and matrices; [buffers](references/buffers.md), [types](references/types.md).
- Create, write and read buffers: `root.createUniform` / `createMutable` / `createReadonly`, `.write`, `.patch`, `await .read()`; [buffers](references/buffers.md).
- Write shader logic: a `'use gpu'` function, or `tgpu.fn([args], ret)` for a fixed signature; [shaders](references/shaders.md), [std](references/std.md).
- Run a kernel: `tgpu.computeFn`, `root.createComputePipeline`, `dispatchWorkgroups`; [pipelines](references/pipelines.md).
- Draw: `tgpu.vertexFn` / `tgpu.fragmentFn` or shell-less `'use gpu'` entry functions, `root.createRenderPipeline`, `tgpu.vertexLayout`, `common.fullScreenTriangle`; [pipelines](references/pipelines.md).
- Record a frame of several pipelines or passes: `root.createCommandEncoder()`; [encoders](references/encoders.md).
- Swap resources per draw or share a layout: `tgpu.bindGroupLayout`, `root.createBindGroup`; [buffers](references/buffers.md).
- Sample images, render to a texture, store to a texture: `root.createTexture`, `.createView`, `root.createSampler`; [textures](references/textures.md).
- Write a shader once and fill in its parts later: `tgpu.slot`, `tgpu.accessor`, `.with`, `.pipe`; [composition](references/composition.md).
- Specialize at compile time: `tgpu.comptime`, `tgpu.unroll`, `std.typeOf`, branches on constants; [shaders](references/shaders.md).
- 3D cameras and transforms: `wgpu-matrix` writing into TypeGPU matrices; [matrices](references/matrices.md).
- Random numbers and noise: `randf`, `perlin2d`, `perlin3d`; [noise](references/noise.md).
- Shapes and distance fields: `@typegpu/sdf`; [sdf](references/sdf.md).
- Colour spaces, Oklab, tonemapping: `@typegpu/color`; [color](references/color.md).
- 2D lighting: `@typegpu/radiance-cascades`; [radiance cascades](references/radiance-cascades.md).
- React and React Native: `@typegpu/react` hooks, worklet frame loops; [react](references/react.md).
- Time GPU work: `withPerformanceCallback`, timestamp queries; [timing](references/timing.md).
- Make a shader faster: [performance](references/performance.md).
- Find why a shader fails to build or renders wrong: [debugging](references/debugging.md).
- Indirect draws and dispatches, ArrayBuffer IO, raw WGSL, `root.unwrap`: [advanced](references/advanced.md).

## The shape of a program

Resources, functions and pipelines are made once at setup; each frame writes the values that changed, records every pass into one command encoder and submits once.

```ts
import { tgpu, d, std } from 'typegpu';

const COUNT = 1024;
const Particle = d.struct({ position: d.vec2f, velocity: d.vec2f });

const root = await tgpu.init();
const particles = root.createMutable(d.arrayOf(Particle, COUNT));
const dt = root.createUniform(d.f32);

const step = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x >= COUNT) {
    return;
  }

  const particle = particles.$[gid.x];
  particle.velocity.y -= 9.8 * dt.$;
  particle.position += particle.velocity * dt.$;
  particle.position = std.clamp(particle.position, d.vec2f(-1), d.vec2f(1));
});

const stepPipeline = root.createComputePipeline({ compute: step });

function frame(seconds: number) {
  dt.write(seconds);

  const encoder = root.createCommandEncoder();
  stepPipeline.with(encoder).dispatchWorkgroups(Math.ceil(COUNT / 64));
  // render passes: encoder.beginRenderPass(...), pipeline.with(pass).draw(...), pass.end()
  encoder.submit();
}

frame(1 / 60);
const result = await particles.read(); // { position: v2f, velocity: v2f }[]
```

- A shader reads a buffer through `.$`; TypeGPU binds it wherever it is used. Use bind group layouts for resources swapped between draws ([buffers](references/buffers.md)).
- Operators on vectors and matrices work in every `'use gpu'` function. Making `tsover` the project's TypeScript lets the editor type-check them ([setup](references/setup.md)).
- `pipeline.with(encoder)` records a pass of its own; open a pass with `encoder.beginRenderPass` / `beginComputePass` when several pipelines share it ([encoders](references/encoders.md)).

## GPU code

- Write each kernel as a `tgpu.computeFn` with `workgroupSize` and a bounds check, then `root.createComputePipeline` and `dispatchWorkgroups(Math.ceil(count / size))`. This is the default over guarded pipelines (`createGuardedComputePipeline` / `dispatchThreads`), which cannot record into an encoder.
- Record each frame into one `root.createCommandEncoder()` and call `encoder.submit()` once. A bare `pipeline.draw()` or `dispatchWorkgroups()` submits on its own.
- Make buffers, textures, bind groups and pipelines at setup; frames only write values and record. Compile ahead of the first frame with `pipeline.initAsync()` ([pipelines](references/pipelines.md)).
- Take all randomness and noise from `@typegpu/noise`: seed `randf` per thread (`randf.seed2(...)`), then `randf.sample()` and its distributions; sample `perlin2d` / `perlin3d` through a gradient cache: `perlin3d.staticCache({ root, size })` piped in with `root.pipe(cache.inject())`, or `dynamicCacheConfig()` when the size changes at runtime ([noise](references/noise.md)).
- Keep values that change in buffers. Values captured from the outer scope are compiled into the shader as constants, and each different capture is a different pipeline.
- Bind a kernel to a descriptive `const` (`const integrate = tgpu.computeFn(...)`): the plugin names the WGSL function after it.

## Rules inside `'use gpu'` functions

These cause most build errors and wrong results. Details in [shaders](references/shaders.md) and [types](references/types.md).

1. **Write arithmetic with operators**: `a * b`, `a + b`, `v *= 2`, `m * v`. `std.add` / `std.sub` / `std.mul` / `std.div` are the fallback for CPU code without `tsover`.
2. **Shift `u32` right with `>>>`**, and wrap a left-hand literal in `d.u32`: `d.u32(0x32) >>> corner`. `>>` is for signed integers.
3. **Write GPU methods as properties**: `alive: (i: number) => { 'use gpu'; ... }`. The plugin compiles function declarations, function expressions and arrows; a shorthand method `alive(i) { ... }` is never compiled.
4. **Vectors, matrices, structs and arrays are references.** `const a = b` aliases. Copy with the schema to get an independent value: `let a = d.vec3f(b)`, `MyStruct(s)`. Expression results (`b * 2`, constructor calls, function returns) are fresh values.
5. **Write `d.f32(1)` where a float must come from a whole-number literal.** The parser reads `1.0` as `1`, an integer. `let sum = 0` declares an `i32`, so a later `sum += 0.5` is truncated to `sum += 0i`: write `let sum = d.f32(0)`. Fractional literals (`0.5`) are fine as they are.
6. **`a / b` on scalars is `f32` division**, even for integers. Divide integer scalars with `std.intdiv(a, b)`. Integer vectors (`vec2i / vec2i`) divide as integers.
7. **Use `std.*` for math**: `std.sin`, `std.mix`, `std.clamp`, `std.normalize`, texture, atomic and subgroup functions ([std](references/std.md)). Several `Math.*` functions compile too; `std` also types vectors and covers the whole WGSL set.
8. **Initialise every variable** so its type is known: `let x = d.f32(0)`. Type annotations don't change the WGSL.
9. **A runtime ternary is `select`**: both sides evaluate, so keep them cheap, side-effect-free scalars or vectors. Use `if` / `else` for structs, arrays and expensive branches. A condition known at compile time prunes the other branch.
10. **Brace every `if` body**, including a single `return`.
11. **Fragment colour outputs have 4 components**: `d.vec4f` for float and unorm targets, even `r8unorm` or `rg16float`, and `d.vec4u` / `d.vec4i` for integer targets (these need a `tgpu.fragmentFn` shell).
12. **Pass textures and samplers straight into calls**: `std.textureSample(layout.$.tex, layout.$.samp, uv)`. Keep them out of variables.

## Checking the result

- Run the project's type check and linter after each edit. `eslint-plugin-typegpu` flags `Math.*`, integer division, invalid assignments, uninitialised variables, unsupported syntax and object literals not wrapped in a schema in `'use gpu'` code. Projects made with the CLI have `types` and `check` scripts.
- Resolve the shader in a test to see its WGSL and its build errors: `tgpu.resolve([pipeline])` under vitest with the plugin, or a Node script with `unplugin-typegpu/node` ([debugging](references/debugging.md)).
- Compare GPU results with a CPU computation of a few elements: read the buffer back with `await buffer.read()`.
- For images, render a frame and look at it; isolate a wrong pixel by outputting intermediate values as colour.
- `console.log` works in compute and fragment `'use gpu'` code for debugging; it adds atomics and costs time, so remove it afterwards ([shaders](references/shaders.md)).

## References

Read the reference for the task before writing the code. Read [shaders](references/shaders.md) before any non-trivial shader.

- [shaders.md](references/shaders.md): `tgpu.fn` vs plain callbacks, entry functions and builtins, polymorphism, syntax limits, `switch`, `**`, `for...of`, `std.range`, `tgpu.unroll`, `tgpu.comptime`, captures, workgroup and private variables, values vs references, `d.ref` pointers, `console.log`.
- [types.md](references/types.md): when `d.f32()` is needed, vector constructors, swizzles and swizzle assignment, sampler and texture schemas, `TgpuBuffer` / `TgpuTexture` types, `d.Infer*`, interpolation, `d.sizeOf` and schema comparison.
- [std.md](references/std.md): the complete `std` listing. Check it before writing a math helper.
- [buffers.md](references/buffers.md): schemas and runtime-sized arrays, usages, writing, slices with `d.memoryLayoutOf`, `patch`, `common.writeSoA`, reading back, bind group layouts.
- [pipelines.md](references/pipelines.md): compute and render pipelines, shell-less entry functions, coordinate conventions, vertex layouts and formats, index buffers, depth, multiple render targets, `fullScreenTriangle`, initialization and WebKit first use, the resolve API.
- [encoders.md](references/encoders.md): recording a frame, pass state, compute passes, immediates, render bundles, raw WebGPU interop, operations recorded into a caller's pass, compute synchronization.
- [composition.md](references/composition.md): defining shaders before resources, slots, accessors and mutable accessors, `.with` / `.pipe` on functions and roots, callbacks, schema-generic producers.
- [textures.md](references/textures.md): creating and writing textures (images, raw, compressed), `common.writeChannels`, mipmaps, views, samplers, storage, depth and external textures, render-to-texture.
- [matrices.md](references/matrices.md): read for 3D work. `wgpu-matrix` with `dst`, column-major layout, camera uniforms, allocation-free writes.
- [performance.md](references/performance.md): read before optimizing. Measured effects of unrolling, branches, memory layout, textures vs buffers, workgroup size, f16.
- [timing.md](references/timing.md): timestamp queries and `withPerformanceCallback`.
- [setup.md](references/setup.md): the CLI, install, roots, canvas and resizing, device features, `unplugin-typegpu` (Vite, Babel, Node, Deno, Bun), `tsover`, the lint plugin, troubleshooting a missing plugin.
- [advanced.md](references/advanced.md): buffer reinterpretation, indirect draw and dispatch, ArrayBuffer IO, raw WGSL (`rawCodeSnippet`, `declare`), minification, `root.unwrap`, what is still `~unstable`.
- [debugging.md](references/debugging.md): checks after edits, resolving shaders in a test or script, reading `ResolutionError`s, isolating a wrong image.
- [react.md](references/react.md): `@typegpu/react` hooks, canvas resizing, React Native worklet frame loops, two threads on one device.
- [noise.md](references/noise.md): `@typegpu/noise` random numbers, distributions, generators, Perlin noise and its caches.
- [sdf.md](references/sdf.md): `@typegpu/sdf` 2D and 3D primitives, operators, anti-aliased masks, baking and jump flood.
- [color.md](references/color.md): `@typegpu/color` conversions, Oklab, hex constants, tonemapping.
- [radiance-cascades.md](references/radiance-cascades.md): `@typegpu/radiance-cascades` 2D global illumination.
- [three.md](references/three.md): `@typegpu/three`, for projects that already render with Three.js.

Pair TypeGPU with [`wgpu-matrix`](https://github.com/greggman/wgpu-matrix) for CPU-side matrix math; its functions accept TypeGPU vectors and matrices as `dst`.

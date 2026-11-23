# TypeGPU Advanced

## Buffer reinterpretation

Pass an existing `GPUBuffer` as the second argument of `root.createBuffer` to alias the same GPU memory with a different type, e.g. to use a storage buffer as a vertex buffer:

```ts
const packedBuffer = root
  .createBuffer(d.disarrayOf(d.unorm8x4, N))
  .$usage('vertex');

packedBuffer.$addFlags(GPUBufferUsage.STORAGE); // before the alias is created

const storageView = root
  .createBuffer(d.arrayOf(d.u32, N), packedBuffer.buffer)
  .$usage('storage');
```

Pair it with the pack/unpack builtins (`std.pack4x8unorm`, `std.unpack4x8unorm`, `std.pack2x16float`, ...) to read compact vertex data, colours or quantized weights as `u32` storage.

Caveats:
- The original buffer's lifecycle is not transferred: keep it alive while the alias is in use.
- Accessing `.buffer` materializes the `GPUBuffer` with its flags baked, so the original must carry every needed raw flag (via `$usage`/`$addFlags`) before the alias is created. `$addFlags()` on the alias throws.
- `$usage()` on the alias is still required for each intended use: it never touches the GPU flags, but it satisfies TypeScript (`StorageFlag` etc.) and TypeGPU's runtime bind checks (`.as(...)`, bind group creation).

## Indirect drawing and dispatching

| Call | Buffer contents |
|---|---|
| `dispatchWorkgroupsIndirect` | 3x `u32`: x, y, z workgroup counts |
| `drawIndirect` | 4x `u32`: vertexCount, instanceCount, firstVertex, firstInstance |
| `drawIndexedIndirect` | indexCount(`u32`), instanceCount(`u32`), firstIndex(`u32`), baseVertex(`i32`), firstInstance(`u32`) |

Each method takes the buffer (a `TgpuBuffer` with `'indirect'` usage, or a raw `GPUBuffer`) and an optional start: the result of `d.memoryLayoutOf`, or a byte offset. Omit it when the params start at byte 0. The methods exist on pipelines and on `pipeline.with(pass)`. Keep `firstInstance` at `0` unless the device has the `'indirect-first-instance'` feature: otherwise WebGPU silently skips the draw.

```ts
const IndirectParams = d.struct({
  vertexCount:   d.u32,
  instanceCount: d.u32,
  firstVertex:   d.u32,
  firstInstance: d.u32,
});
const indirectBuf = root.createBuffer(IndirectParams).$usage('storage', 'indirect');
pipeline.drawIndirect(indirectBuf);
```

For params inside a larger struct, pass `d.memoryLayoutOf(...)` (see `references/buffers.md`) instead of a hardcoded byte offset. Its `contiguous` count lets TypeGPU warn when the params would run across padding; a `vec4u` field guarantees there is none:

```ts
const Schema = d.struct({
  someData:   d.arrayOf(d.vec3f, 10),
  drawParams: d.vec4u, // [vertexCount, instanceCount, firstVertex, firstInstance]
});

const MyBuffer = root.createBuffer(Schema).$usage('storage', 'indirect');
const drawOffset = d.memoryLayoutOf(Schema, (s) => s.drawParams); // compute once
pipeline.drawIndirect(MyBuffer, drawOffset);
```

## CPU-side serialization without buffers

These mirror `buffer.write`/`patch`/`read` on a raw `ArrayBuffer` with an explicit schema, for pre-serializing schema-shaped data (workers, files, staging). All three are synchronous:

```ts
import { d, writeToArrayBuffer, patchArrayBuffer, readFromArrayBuffer } from 'typegpu';

const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });
const Boids = d.arrayOf(Boid, 4);

const bytes = new ArrayBuffer(d.sizeOf(Boids));
writeToArrayBuffer(bytes, Boids, [/* 4 boids */]);  // also accepts ArrayBuffer/TypedArray input,
                                                   // and { startOffset, endOffset } like buffer.write
patchArrayBuffer(bytes, Boids, { 2: { pos: d.vec2f(1, 0) } });
const boids = readFromArrayBuffer(bytes, Boids);
```

Writes compile a serializer with `new Function` after probing whether eval is allowed. Under a strict Content Security Policy the probe itself reports a violation; call `setGlobalJITPreference('disabled')` (exported from `typegpu`) before the first write to skip it.

## Raw WGSL escape hatches

Use these only to integrate an existing raw-WGSL codebase; plain strings are not shader values.

`tgpu['~unstable'].rawCodeSnippet(expression, type, origin?, possibleSideEffects?)`: a typed WGSL expression usable inside shaders as `snippet.$` (e.g. referencing a variable you know exists in the final bundle). `origin` defaults to `'runtime'`; pass `'constant'` for constant expressions, or the address space (`'uniform'`, `'mutable'`, `'readonly'`, `'workgroup'`, `'private'`, `'handle'`) for a direct reference to a variable. `possibleSideEffects` defaults to `true`, which keeps the snippet out of `select()`; pass `false` for pure expressions.

`tgpu['~unstable'].declare(source)`: emits a WGSL declaration whenever a depending object resolves (diagnostic directives, hand-written bindings). Reference TypeGPU resources with `.$uses({...})` (at most once); use slots/accessors when dependencies need to vary.

```ts
const declaration = tgpu['~unstable']
  .declare('@group(0) @binding(0) var<uniform> settings: Settings;')
  .$uses({ Settings });

const readSettings = () => {
  'use gpu';
  declaration.$; // pulls the declaration into the shader; emits no code here, no-op in JS
  // ...
};
```

WGSL-template functions reference it through `.$uses({ declaration })` instead.

## Minification and warnings

- `tgpu.init({ unstable_minify: true })` strips comments and redundant whitespace from the WGSL of that root's pipelines; `tgpu.resolve(objs, { unstable_minify: true })` does the same for standalone resolves. The build plugin also offers `unstable_obfuscate: true` (renames identifiers in emitted metadata; requires `autoNamingEnabled: false`).
- `import { warn } from 'typegpu'`; `warn.disable('implicit-conversion')` silences one warning type, `warn.reset()` restores defaults. Prefer fixing the cause.
- `tgpu['~unstable'].namespace()` passed as `{ names }` to several `tgpu.resolve` calls shares one naming/declaration scope (no duplicate declarations across chunks). It is stateful: later chunks may omit declarations emitted earlier, so no single result is self-contained.

## `root.unwrap`: raw WebGPU objects and forced initialization

`root.unwrap(resource)` returns the underlying WebGPU object, for APIs that need native handles: `GPUBuffer` for buffers and for `createUniform`/`createMutable`/`createReadonly` bindings, `GPUComputePipeline` / `GPURenderPipeline`, `GPUBindGroupLayout`, `GPUBindGroup`, `GPUTexture`, `GPUTextureView`, `GPUSampler` (comparison samplers too), `GPUQuerySet`, command encoders, passes and render bundle encoders (see `references/encoders.md`), and `GPUVertexBufferLayout` for vertex layouts.

It also forces initialization. Every TypeGPU resource is lazy: buffers (even those with initial data), pipelines and shader compilation all wait for first use. Pipelines have `pipeline.initSync()` / `await pipeline.initAsync()` (see `references/pipelines.md`); for buffers and textures, `unwrap` is the forcing mechanism. Use it only when first-use timing is visible to the user and a loading screen or asset preload can absorb the cost:

```ts
root.unwrap(particleBuffer); // initial data written here instead of on first dispatch
```

## What is still `~unstable`

`tgpu['~unstable']` holds `declare`, `rawCodeSnippet`, `namespace` (above), `immediateVar` (see `references/encoders.md`) and `simulate(callback)`, which runs a callback synchronously on the CPU as one simulated GPU thread (so `.$` on private/workgroup variables and buffers works) and returns `{ value, buffers, privateVars, workgroupVars }` without touching GPU state. Its other members (`fn`, `computeFn`, `slot`, `derived` for `tgpu.lazy`, ...) are deprecated aliases of stable `tgpu.*` APIs. The methods on `root['~unstable']` are deprecated aliases too: use `root.createTexture`, `root.createSampler`, `root.createComparisonSampler`, `root.createCommandEncoder`, `root.createRenderBundleEncoder`, `root.createGuardedComputePipeline`, `root.pipe` and `root.with`.

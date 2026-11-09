# TypeGPU Advanced

## Buffer reinterpretation

Pass an existing `GPUBuffer` as `initialData` to create a TypeGPU buffer aliasing the same GPU memory with a different type. Useful for SSBO-as-vertex-buffer patterns.

```ts
const packedBuffer = root
  .createBuffer(d.disarrayOf(d.unorm8x4, N))   // compact vertex data
  .$usage('vertex');

// Add STORAGE to the underlying GPUBuffer BEFORE it is materialized:
packedBuffer.$addFlags(GPUBufferUsage.STORAGE);

// Alias the same memory, typed as u32 storage:
const storageView = root
  .createBuffer(d.arrayOf(d.u32, N), packedBuffer.buffer)
  .$usage('storage'); // TypeGPU-level usability + typing; no effect on GPU flags
```

Pairs well with WGSL pack/unpack builtins (`std.pack4x8unorm`, `std.unpack4x8unorm`, `std.pack2x16float`, etc.) - reinterpret a buffer as `u32` storage and pack/unpack in the shader for compact vertex data, color encoding, or quantized weights.

**Caveats:**
- The original buffer's lifecycle is NOT transferred - keep it alive while the alias is in use.
- Real GPU flags cannot be applied through the alias: accessing `.buffer` materializes the `GPUBuffer` with its flags baked, so the original must carry every needed raw flag (via `$usage`/`$addFlags`) before the alias is created. `$addFlags()` on the alias throws.
- `$usage()` on the alias IS still required for each intended use - it never touches the GPU flags, but it satisfies TypeScript (`StorageFlag` etc.) and TypeGPU's runtime bind checks (`.as(...)`, bind group creation).

---

## Indirect drawing and dispatching

Indirect buffers let the GPU determine draw/dispatch counts - foundation of GPU-driven rendering.

### Required buffer contents

| Call | Layout |
|---|---|
| `dispatchWorkgroupsIndirect` | 3x `u32`: x, y, z workgroup counts |
| `drawIndirect` | 4x `u32`: vertexCount, instanceCount, firstVertex, firstInstance |
| `drawIndexedIndirect` | indexCount(`u32`), instanceCount(`u32`), firstIndex(`u32`), baseVertex(`i32`), firstInstance(`u32`) |

All indirect methods have two overloads: `(buffer)` (offset 0) and `(buffer, offsetInfo)`. When the indirect params start at the beginning of the buffer, prefer the no-offset overload - it's cleaner and equally safe.

```ts
// Dedicated indirect buffer - no offset needed:
const IndirectParams = d.struct({
  vertexCount:   d.u32,
  instanceCount: d.u32,
  firstVertex:   d.u32,
  firstInstance: d.u32,
});
const indirectBuf = root.createBuffer(IndirectParams).$usage('storage', 'indirect');
pipeline.drawIndirect(indirectBuf); // offset 0 implied
```

### `d.memoryLayoutOf` - safe offset calculation

`d.memoryLayoutOf(schema, accessor?)` returns `{ offset, contiguous }`: the byte offset of the accessed element and the number of contiguous data bytes from there (up to the first padding byte). It accepts WGSL and loose schemas (`d.unstruct`, `d.disarrayOf`, custom `d.align`/`d.size`). When indirect params are embedded in a larger struct, pass the result instead of hardcoding byte offsets:

```ts
const Schema = d.struct({
  someData:      d.arrayOf(d.vec3f, 10),
  vertexCount:   d.u32,
  instanceCount: d.u32,
  firstVertex:   d.u32,
  firstInstance: d.u32,
});

const MyBuffer = root.createBuffer(Schema).$usage('storage', 'indirect');

const drawOffset = d.memoryLayoutOf(Schema, (s) => s.vertexCount); // compute once
pipeline.drawIndirect(MyBuffer, drawOffset); // reuse every frame
```

### Packing indirect params as a vector

`vec4u` guarantees no padding between the four draw params:

```ts
const Schema = d.struct({
  someData:   d.arrayOf(d.vec3f, 10),
  drawParams: d.vec4u, // [vertexCount, instanceCount, firstVertex, firstInstance]
});

const offset = d.memoryLayoutOf(Schema, (s) => s.drawParams);
pipeline.drawIndirect(MyBuffer, offset);
```

---

## Command encoders

Typed command encoders, multi-pipeline passes, render bundles, and raw WebGPU encoder interop are covered in `references/encoders.md`.

---

## CPU-side serialization without buffers

Top-level exports mirror `buffer.write`/`patch`/`read` but operate on a raw `ArrayBuffer` with an explicit schema — useful for pre-serializing schema-shaped data (workers, files, staging). All three are **synchronous** (pure CPU-side (de)serialization — no `await`, unlike `buffer.read()`):

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

---

## Raw WGSL escape hatches

Never reach for these unless integrating with an existing raw-WGSL codebase specifically requires it - TypeGPU code should express everything else through typed APIs. They are the sanctioned paths for injecting hand-written WGSL (plain strings are not shader values):

**`tgpu['~unstable'].rawCodeSnippet(expression, type, origin?, possibleSideEffects?)`** — a typed WGSL expression usable inside shaders (e.g. referencing a variable you know exists in the final bundle). `origin` defaults to `'runtime'`; `possibleSideEffects` defaults to `true`.

**`tgpu['~unstable'].declare(source)`** — emits a WGSL declaration whenever a depending object resolves (diagnostic directives, hand-written bindings). Reference TypeGPU resources with `.$uses({...})` (at most once); use slots/accessors when dependencies need to vary.

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

---

## Minification and warnings

**Shader minification** — `tgpu.init({ unstable_minify: true })` minifies generated WGSL for that root; `tgpu.resolve(objs, { unstable_minify: true })` for standalone resolves. The build plugin additionally offers `unstable_obfuscate: true` (renames identifiers in emitted metadata; requires `autoNamingEnabled: false`).

**Silencing warnings** — `import { warn } from 'typegpu'`; `warn.disable('implicit-conversion')` silences one warning type, `warn.reset()` restores defaults. Prefer fixing the cause.

**Shared resolution namespaces** — `tgpu['~unstable'].namespace()` passed as `{ names }` to several `tgpu.resolve` calls shares one naming/declaration scope (no duplicate declarations across chunks). Stateful: later chunks may omit declarations emitted earlier, so don't treat each result as self-contained.

---

## `root.unwrap` — raw WebGPU objects and forced initialization

`root.unwrap(resource)` serves two distinct purposes.

**Escape hatch.** Returns the underlying raw WebGPU object, letting you pass TypeGPU resources to APIs that require native handles:

```ts
const gpuBuffer   = root.unwrap(tgpuBuffer);         // GPUBuffer
const gpuPipeline = root.unwrap(computePipeline);    // GPUComputePipeline
const gpuLayout   = root.unwrap(bindGroupLayout);    // GPUBindGroupLayout
const gpuTexture  = root.unwrap(tgpuTexture);        // GPUTexture
const gpuView     = root.unwrap(textureView);        // GPUTextureView
const gpuSampler  = root.unwrap(tgpuSampler);        // GPUSampler
// also: TgpuRenderPipeline, TgpuBindGroup, TgpuVertexLayout,
//       TgpuComparisonSampler, TgpuQuerySet
```

`root.device` gives the underlying `GPUDevice` directly.

**Forced initialization.** All TypeGPU resources are lazy — buffers (even those with initial data), pipelines, and shader compilation all defer until first use. **This is usually exactly what you want.** For pipelines, use the explicit `pipeline.initSync()` / `await pipeline.initAsync()` (see `references/pipelines.md`); for buffers and textures, `unwrap` is the forcing mechanism:

```ts
// Optional: force init during a loading screen rather than on first use
root.unwrap(particleBuffer); // initial data written here instead of on first dispatch
```

Don't reach for this by default — lazy init is simpler and correct for most apps. It's mainly worth considering when first-use timing is observable to the user and you have a natural moment (loading screen, asset preload) to absorb the cost.

---

## `$addFlags` - raw usage flags

For flags not covered by `$usage` (e.g. `MAP_READ`, `QUERY_RESOLVE`):

```ts
const mappableBuffer = root.createBuffer(d.vec4f).$addFlags(GPUBufferUsage.MAP_READ);
```

`MAP_READ` and `MAP_WRITE` are mutually exclusive with most other usages - setting either overwrites existing flags and adds `COPY_(DST|SRC)`. Other flags are OR'd. Cannot be used on buffers created from an existing `GPUBuffer`.

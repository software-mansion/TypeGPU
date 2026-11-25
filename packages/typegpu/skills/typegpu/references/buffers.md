# Data schemas, buffers and bind groups

Docs: https://docs.swmansion.com/TypeGPU/apis/buffers.md, https://docs.swmansion.com/TypeGPU/apis/bind-groups.md

## Data schemas (`d.*`)

### Scalars, vectors and matrices

- Scalars `d.f32`, `d.i32`, `d.u32`, `d.f16`. `f16` and `vec*h` need the `shader-f16` device feature (`references/setup.md`).
- Vectors `d.vec2f` ... `d.vec4f`, with `i`, `u`, `h` and `b` suffixes for `i32`, `u32`, `f16` and `bool`.
- Matrices `d.mat2x2f`, `d.mat3x3f`, `d.mat4x4f`.
- `d.bool` and `vec*b` are shader-side only (not host-shareable): use `d.u32` in buffers.

Instance types: `d.vec3f()` -> `d.v3f`, `d.mat4x4f()` -> `d.m4x4f`. Vector constructors compose from any mix of scalars and smaller vectors or swizzles (`d.vec4f(rgb, 1)`, `d.vec3f(v.xy, newZ)`); overloads in `references/types.md`.

### Compound types
```ts
const Particle = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
  color:    d.vec4f,
});

const ParticleArray = d.arrayOf(Particle, 1000);
```

**Runtime-sized schemas.** `d.arrayOf(Element)` without a count returns a function `(n: number) => WgslArray<Element>`. Pass the function itself (unsized) to bind group layouts; call it with a count for `createBuffer`, which needs the size on the CPU.

```ts
const layout = tgpu.bindGroupLayout({
  data: { storage: d.arrayOf(d.f32), access: 'mutable' },
});
const buf = root.createBuffer(d.arrayOf(d.f32, 1024)).$usage('storage');

// A struct with a runtime-sized last field becomes a factory:
const RuntimeStruct = (n: number) =>
  d.struct({
    counter: d.atomic(d.u32),
    items:   d.arrayOf(d.f32, n),
  });

const layout2 = tgpu.bindGroupLayout({
  runtimeData: { storage: RuntimeStruct, access: 'mutable' },
});
const buf2 = root.createBuffer(RuntimeStruct(1024)).$usage('storage');
```

---

## Buffers

### Creating

```ts
const buf = root.createBuffer(d.arrayOf(Particle, 1000)).$usage('storage');

// Initial value (buffers start zeroed, so pass one only when non-zero):
const uBuf = root.createBuffer(Config, { time: 1, scale: 2.0 }).$usage('uniform');

// Initializer callback, run while the buffer is still mapped (cheapest CPU path):
const chunked = root.createBuffer(Schema, (mappedBuffer) => {
  mappedBuffer.write([10, 20], { startOffset: firstChunk.offset });
  mappedBuffer.write([30, 40], { startOffset: secondChunk.offset });
});

// Wrap an existing GPUBuffer (you own its lifecycle and flags):
const wrapped = root.createBuffer(d.u32, existingGPUBuffer);
```

### Usage flags

| Literal | Shader access |
|---|---|
| `'uniform'` | `var<uniform>` |
| `'storage'` | `var<storage, read>` (or `read_write` with `access: 'mutable'`) |
| `'vertex'` | vertex input, paired with `tgpu.vertexLayout` |
| `'index'` | index buffer (array of `d.u16` or `d.u32` only) |
| `'indirect'` | indirect dispatch/draw |

Buffers TypeGPU creates get `COPY_SRC | COPY_DST` automatically; a wrapped `GPUBuffer` keeps its own flags. `$addFlags(GPUBufferUsage.X)` ORs in any flag not covered by `$usage` (e.g. `QUERY_RESOLVE`). `MAP_READ` and `MAP_WRITE` instead replace all flags, with `MAP_READ | COPY_DST` or `MAP_WRITE | COPY_SRC`, so a mappable buffer serves only as a copy target or source. `$addFlags` throws on a buffer wrapping an existing `GPUBuffer`.

Arrays in a uniform buffer need a 16-byte element stride: `d.arrayOf(d.f32, n)` or `d.arrayOf(d.vec2f, n)` as a uniform breaks on some devices, and `$usage('uniform')` and `createUniform` warn in development builds. Use `vec4f` elements, wrap the element in a struct with `d.align(16, ...)`, or use storage.

### Writing

`.write(value)` handles alignment. Four input forms, slowest to fastest:

| Form | Example (`vec3f`) | Notes |
|---|---|---|
| Typed instance | `d.vec3f(1, 2, 3)` | Allocates a wrapper |
| Plain JS array / tuple | `[1, 2, 3]` | No wrapper, padding added automatically |
| TypedArray | `new Float32Array([1, 2, 3])` | Bytes copied verbatim: must include WGSL padding |
| ArrayBuffer | `rawBytes` | Same verbatim copy as a TypedArray |

Cache plain arrays or `Float32Array` at setup and reuse them. For the padding rules (`vec3f` takes 12 bytes but aligns to 16, so arrays of it have a 16-byte stride; `mat3x3f` pads each column) and fast-path guidance, see `references/matrices.md`.

**Slice write.** `d.memoryLayoutOf(schema, accessor?)` returns `{ offset, contiguous }` in bytes for the element the accessor navigates to, including in loose schemas (`d.unstruct`, `d.disarrayOf`):

```ts
const layout = d.memoryLayoutOf(schema, (a) => a[3]);
buffer.write([4, 5, 6], { startOffset: layout.offset });
```

An optional `endOffset` stops the write at that byte. Both offsets must be multiples of 4 bytes (an `endOffset` at the end of the schema is always allowed).

**`.patch(data)`** updates specific struct fields or array indices and leaves the rest:

```ts
planetBuffer.patch({
  mass: 123.1,
  colors: { 2: [1, 0, 0], 4: d.vec3f(0, 0, 1) },
});
```

An array field takes a sparse `{ index: value }` object, a plain array (writes entries from index 0, as many as given) or a TypedArray (bytes verbatim). Sparse indices out of range throw. Uploads must start and end on 4-byte boundaries, so patching a single `d.u16` element throws (except the last element of an odd-length array, which is padded to the boundary): patch 4-byte-aligned pairs (`{ 0: a, 1: b }`) or write the whole array.

**`common.writeSoA(buffer, { field: Float32Array, ... })`** scatters separate packed per-field arrays into the GPU's AoS layout with correct padding. Use it when CPU data is already field-separated (particles, simulations, loaded models); examples in `references/matrices.md`, the model-loading pattern in `references/pipelines.md`.

`destBuffer.copyFrom(srcBuffer)` copies on the GPU (schemas must match), `buffer.clear()` zeroes, `buffer.destroy()` frees (a buffer wrapping an existing `GPUBuffer` leaves it alive). `copyFrom` and `clear` take an optional command encoder as the last argument, recording into it instead of submitting on their own.

### Shorthand "fixed" resources

A fixed resource is bound wherever a shader references it, with no bind group:

```ts
const particlesMutable = root.createMutable(d.arrayOf(Particle, 1000));  // var<storage, read_write>
const configUniform    = root.createUniform(Config);                     // var<uniform>
const bufReadonly      = root.createReadonly(d.arrayOf(d.f32, N));       // var<storage, read>
```

Each takes the same optional second argument as `createBuffer` (initial value, initializer callback or an existing `GPUBuffer`). On the CPU a binding has `.write`, `.patch` and `.read`; `.buffer` is its `TgpuBuffer`, for `copyFrom`, `clear` and `destroy`.

Shaders read them through `particlesMutable.$`, `configUniform.$`. TypeGPU puts them in an automatic catch-all bind group, and each entry is visible only to the shader stages that use it, so it counts only towards those stages' limits (`maxStorageBuffersPerShaderStage`, ...). Prefer fixed resources by default; switch to manual bind groups to swap resources per frame, manage `@group` indices, or share layouts across pipelines.

A manually created buffer converts to the same kind of binding with `buffer.as('uniform' | 'readonly' | 'mutable')` (requires the matching `$usage`), for `.$` access in a shader.

---

## Bind group layouts (manual binding)

```ts
const layout = tgpu.bindGroupLayout({
  config:    { uniform: ConfigSchema },
  particles: { storage: d.arrayOf(Particle), access: 'mutable' },
  mySampler: { sampler: 'filtering' },   // 'filtering' | 'non-filtering' | 'comparison'
  myTexture: { texture: d.texture2d(d.f32) },
});

// Inside shaders: layout.$.config, layout.$.particles, ...

const bindGroup = root.createBindGroup(layout, {
  config:    configBuffer,
  particles: particleBuffer,
  mySampler: tgpuSampler,
  myTexture: textureOrView,
});

pipeline.with(bindGroup).dispatchWorkgroups(N);
```

Buffer bindings from `createUniform`/`createMutable`/`createReadonly` are accepted directly as entries; a mutable binding fits only an `access: 'mutable'` entry, a readonly one only a readonly entry. Raw `GPUBuffer`, `GPUTexture`, `GPUTextureView` and `GPUSampler` objects are accepted too. A `null` layout entry reserves its binding index and is omitted from `createBindGroup`. For texture entries (`sampleType`, views, external textures) see `references/textures.md`.

Bind groups match layouts by object identity: create the group from the same layout object the shader reads through. An identical layout created a second time (inside a component or factory) is a different layout, and the draw throws `Missing bind groups for layouts`.

Each entry takes an optional `visibility: ['compute' | 'vertex' | 'fragment', ...]`. The default is all three stages, except mutable storage buffers and writable storage textures, which default to `['compute', 'fragment']` (WebGPU forbids writable storage in vertex shaders). Read-only storage textures get all three. Narrow it when a pipeline nears a per-stage limit.

`layout.$idx(0)` pins the `@group` index, for raw WGSL that hardcodes it.

## Cache bind groups and views

`root.createBindGroup(...)` and `texture.createView(...)` allocate fresh GPU objects on each call. Create them once at setup, next to the resource they wrap, and reuse the handles; per-frame allocation raises GC pressure and causes stutters. When a view or bind group varies per frame, cache the small set you cycle through.

---

## Reading results back

`await buffer.read()` (also on `createMutable`/`createReadonly`/`createUniform` bindings) returns a JS value matching the schema. It suits an occasional inspection or export: it creates a staging buffer and submits its own copy, outside any encoder you are recording. If only a later GPU pass needs the value, consume it there instead of reading it back.

Repeated reads (telemetry, per-frame statistics) need a policy, or pending reads pile up:

- **Allow one read in flight.** Skip a new request while the previous one is pending, and ignore a result that arrives after a reset. This drop policy suits telemetry; an export or a decision the app depends on should await its own result.
- **Reuse staging buffers for sustained reads.** A `MAP_READ` buffer of the same schema is its own staging buffer: `read()` maps it in place, decodes and unmaps. Record the copy into the frame's encoder after the producer:

```ts
const staging = root.createBuffer(Stats).$addFlags(GPUBufferUsage.MAP_READ);

// ...producer passes recorded into `encoder`...
staging.copyFrom(statsMutable.buffer, encoder);
encoder.submit();
const stats = await staging.read();
```

A staging buffer cannot take a new copy while its read is pending, so keep a small bounded pool and skip telemetry when it is saturated. To consume raw bytes instead of decoded values, do the same with raw `GPUBuffer`s (`root.unwrap(buffer)`, `copyBufferToBuffer`, `mapAsync`): copy offsets and sizes must be multiples of 4, mapped-range offsets multiples of 8, and the bytes must be copied out before `unmap()`.

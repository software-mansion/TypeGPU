# Data schemas, buffers and bind groups

Docs: https://docs.swmansion.com/TypeGPU/apis/buffers.md, https://docs.swmansion.com/TypeGPU/apis/bind-groups.md

## Data schemas (`d.*`)

A schema defines memory layout and infers TypeScript types; the same schema is used for buffers, shader signatures, and bind group entries.

### Scalars
```ts
d.f32    d.i32    d.u32    d.f16   // f16 needs the 'shader-f16' device feature (references/setup.md)
// d.bool is NOT host-shareable - use d.u32 in buffers
```

### Vectors and matrices
```ts
d.vec2f  d.vec3f  d.vec4f     // f32
d.vec2i  d.vec3i  d.vec4i     // i32
d.vec2u  d.vec3u  d.vec4u     // u32
d.vec2h  d.vec3h  d.vec4h     // f16
d.vec2b  d.vec3b  d.vec4b     // bool - shader-side only (not host-shareable)

d.mat2x2f   d.mat3x3f   d.mat4x4f
```

Instance types: `d.vec3f()` -> `d.v3f`, `d.mat4x4f()` -> `d.m4x4f`.

**Vector constructors are richly overloaded** — they compose from any mix of scalars, smaller vectors, and swizzles that adds up to the right component count (`d.vec4f(rgb, 1)`, `d.vec3f(v.xy, newZ)`). Prefer them over manual component decomposition; full overload listing in `references/types.md`.

### Compound types
```ts
const Particle = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
  color:    d.vec4f,
});

const ParticleArray = d.arrayOf(Particle, 1000); // fixed-size
```

**Runtime-sized schemas.** `d.arrayOf(Element)` without a count returns a *function* `(n: number) => WgslArray<Element>`. This dual nature is the key: pass the function itself (unsized) to bind group layouts, call it with a count (sized) for buffer creation.

```ts
// Plain array - arrayOf without count is already a factory:
const layout = tgpu.bindGroupLayout({
  data: { storage: d.arrayOf(d.f32), access: 'mutable' },  // unsized for layout
});
const buf = root.createBuffer(d.arrayOf(d.f32, 1024)).$usage('storage'); // sized for buffer

// Struct with a runtime-sized last field - wrap in a factory function:
const RuntimeStruct = (n: number) =>
  d.struct({
    counter: d.atomic(d.u32),
    items:   d.arrayOf(d.f32, n),  // last field gets the runtime size
  });

const layout2 = tgpu.bindGroupLayout({
  runtimeData: { storage: RuntimeStruct, access: 'mutable' }, // unsized (the function)
});
const buf2 = root.createBuffer(RuntimeStruct(1024)).$usage('storage'); // sized (called)
```

You cannot pass an unsized schema directly to `createBuffer` - size must be known on the CPU.

---

## Buffers

### Creating

```ts
// Schema only:
const buf = root.createBuffer(d.arrayOf(Particle, 1000)).$usage('storage');

// With typed initial value (only when non-zero — all buffers are zero-initialized by default):
const uBuf = root.createBuffer(Config, { time: 1, scale: 2.0 }).$usage('uniform');

// With an initializer callback - buffer is still mapped (cheapest CPU path):
const buf = root.createBuffer(Schema, (mappedBuffer) => {
  mappedBuffer.write([10, 20], { startOffset: firstChunk.offset });
  mappedBuffer.write([30, 40], { startOffset: secondChunk.offset });
});

// Wrap an existing GPUBuffer (you own its lifecycle and flags):
const buf = root.createBuffer(d.u32, existingGPUBuffer);
buf.write(12);
```

### Usage flags

| Literal | Shader access |
|---|---|
| `'uniform'` | `var<uniform>` |
| `'storage'` | `var<storage, read>` (or `read_write` with `access: 'mutable'`) |
| `'vertex'` | vertex input, paired with `tgpu.vertexLayout` |
| `'index'` | index buffer (array of `d.u16` or `d.u32` only) |
| `'indirect'` | indirect dispatch/draw |

All buffers get `COPY_SRC | COPY_DST` automatically. `$addFlags(GPUBufferUsage.X)` adds any flag not covered by `$usage`.

### Writing

`.write(value)` handles alignment. Four input forms (slowest → fastest):

| Form | Example (`vec3f`) | Notes |
|---|---|---|
| Typed instance | `d.vec3f(1, 2, 3)` | Allocates a wrapper — fine for setup/prototypes |
| Plain JS array / tuple | `[1, 2, 3]` | No allocation, padding added automatically |
| TypedArray | `new Float32Array([1, 2, 3])` | Bytes copied verbatim — **must include WGSL padding** |
| ArrayBuffer | `rawBytes` | Maximum throughput, bytes copied verbatim |

Cache plain arrays or `Float32Array` at setup and reuse. For the padding rules (`vec3f` = 16 bytes, `mat3x3f` per-column padding) and full fast-path guidance, see `references/matrices.md`.

**Slice write** - update a sub-region using `d.memoryLayoutOf` to get byte offsets:

```ts
const layout = d.memoryLayoutOf(schema, (a) => a[3]);
buffer.write([4, 5, 6], { startOffset: layout.offset });
```

`d.memoryLayoutOf(schema, accessor?)` returns `{ offset, contiguous }` in bytes for the element the accessor navigates to, and works for loose schemas (`d.unstruct`, `d.disarrayOf`) too. An optional `endOffset` stops the write at that byte. Both offsets must be multiples of 4 bytes (an `endOffset` at the end of the schema is always allowed).

**`.patch(data)`** - update specific struct fields or array indices without touching the rest:

```ts
planetBuffer.patch({
  mass: 123.1,
  colors: { 2: [1, 0, 0], 4: d.vec3f(0, 0, 1) },
});
```

**`common.writeSoA(buffer, { field: Float32Array, ... })`** - scatter separate packed per-field arrays into the GPU's AoS layout with correct padding. The idiomatic path for particle systems, simulations, and model loading where CPU data is already field-separated. See `references/matrices.md` for examples and `references/pipelines.md` for the model-loading pattern.

**GPU-side copy:** `destBuffer.copyFrom(srcBuffer)` (schemas must match). **Zeroing:** `buffer.clear()`. **Cleanup:** `buffer.destroy()`. Both `copyFrom` and `clear` take an optional command encoder — see `references/encoders.md`.

### Reading

```ts
const data = await buffer.read(); // returns a typed JS value matching the schema
```

### Shorthand "fixed" resources

Skip manual bind groups - the buffer is always bound when referenced in any shader:

```ts
const particlesMutable = root.createMutable(d.arrayOf(Particle, 1000));  // var<storage, read_write>
const configUniform    = root.createUniform(Config);                     // var<uniform>
const bufReadonly      = root.createReadonly(d.arrayOf(d.f32, N));       // var<storage, read>
```

Access inside shaders via `particlesMutable.$`, `configUniform.$`. TypeGPU puts them in an automatic catch-all bind group, and each entry is visible only to the shader stages that use it, so it counts only towards those stages' limits (`maxStorageBuffersPerShaderStage`, ...). Prefer fixed resources by default; switch to manual bind groups when you need to swap resources per frame, manage `@group` indices, or share layouts across pipelines.

A manually created buffer converts to the same kind of binding with `buffer.as('uniform' | 'readonly' | 'mutable')` (requires the matching `$usage`) — use it when you hold a `TgpuBuffer` but need `.$` access in a shader.

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

Buffer bindings from `createUniform`/`createMutable`/`createReadonly` are accepted directly as entries (no need to unwrap to a buffer).

Each entry takes an optional `visibility: ['compute' | 'vertex' | 'fragment', ...]`. The default is all three stages, except mutable storage buffers and storage textures, which default to `['compute', 'fragment']` (WebGPU forbids writable storage in vertex shaders). Narrow it when a pipeline nears a per-stage limit.

Explicit `@group` index (only needed when integrating with raw WGSL that hardcodes group indices): `layout.$idx(0)`.

## Cache bind groups and views

`root.createBindGroup(...)` and `texture.createView(...)` allocate fresh GPU objects each call. Fine for prototypes; for anything you care about, create them once at setup (near the resource they wrap), store handles in `const`s, and reuse. Per-frame allocation isn't slow per se, but it raises GC pressure and introduces stutters. When a view or bind group legitimately varies each frame, cache the small set you cycle through.

---

## Reading results back

`await buffer.read()` (also on `createMutable`/`createReadonly`/`createUniform` bindings) is right for an occasional inspection or export. It creates staging storage and submits its own copy, outside any encoder you are recording. If only a later GPU pass needs the value, consume it there instead of reading it back.

Repeated reads (telemetry, per-frame statistics) need a policy, or pending reads pile up:

- **Allow one read in flight.** Skip a new request while the previous one is pending, and ignore a result that arrives after a reset. This drop policy suits telemetry; an export or a decision the app depends on should await its own result.
- **Reuse staging buffers for sustained reads.** Copy into a raw `MAP_READ | COPY_DST` buffer after the producer, submit, then map:

```ts
encoder.copyBufferToBuffer(source, 0, staging, 0, byteLength);
device.queue.submit([encoder.finish()]);
await staging.mapAsync(GPUMapMode.READ, 0, byteLength);
try {
  consume(new Uint8Array(staging.getMappedRange(0, byteLength)).slice());
} finally {
  staging.unmap();
}
```

Here the encoder and buffers are raw WebGPU objects (`root.unwrap(buffer)` gives the `GPUBuffer`). Copy offsets and sizes must be multiples of 4; mapped-range offsets multiples of 8. Copy or decode the bytes before unmapping, and return a staging buffer to its pool only after it is unmapped. Bound the pool, and skip telemetry when it is saturated.

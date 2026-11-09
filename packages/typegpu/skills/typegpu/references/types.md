# TypeGPU Type System & Literal Handling

Docs: https://docs.swmansion.com/TypeGPU/apis/data-schemas.md

## Abstract types — plain JS literals are usually enough

Plain JS numbers become abstract types that auto-convert without any cast in the generated WGSL:

| JS value | Abstract type | Resolves to |
|---|---|---|
| `0.96`, `1.5` (non-integer) | `abstractFloat` | `f32`, `f16` |
| `0`, `1`, `42` (integer) | `abstractInt` | `i32`, `u32`, `f32`, `f16` |

So `d.f32(0.88)` as an arithmetic operand is always redundant — write `0.88`. Same inside vector constructors: `d.vec3f(0.52, 0.68, 0.12)`, no per-element `d.f32()`.

**When `d.f32()` IS needed:**
- `1.0` — bundler may strip `.0` → `abstractInt` → `i32`. Use `d.f32(1)` or keep a fractional part (`1.1` is fine).
- Uninitialised variable: `let x: number` errors — annotation is stripped. Use `let x = d.f32(0)`.

## Division always produces `f32`

`/` always yields `f32` regardless of operand types — `d.i32(10) / d.i32(3)` is `3.333...`. For integer division use `std.intdiv(a, b)` (truncates toward zero). `d.i32(a / b)` also truncates, but it divides in `f32` first, so it loses precision above 2^24 and costs a float round-trip.

## TypeScript annotations don't affect WGSL

Type annotations are stripped before transpilation. WGSL type comes from the runtime value — the constructor called, the buffer schema, or the abstract literal type. `let x: d.v3f` still errors; the annotation does nothing.

## Vector constructors are richly overloaded — use them

They compose from any mix of scalars and smaller vectors that adds up to the right component count:

```ts
d.vec3f()              // zero-init: (0, 0, 0)
d.vec3f(1)             // broadcast:  (1, 1, 1)
d.vec3f(1, 2, 3)       // individual components
d.vec3f(someVec2, 1)   // vec2 + scalar
d.vec3f(1, someVec2)   // scalar + vec2

d.vec4f()              // zero-init: (0, 0, 0, 0)
d.vec4f(0.5)           // broadcast:  (0.5, 0.5, 0.5, 0.5)
d.vec4f(rgb, 1)        // vec3 + scalar (common: color + alpha)
d.vec4f(v2a, v2b)      // two vec2s
d.vec4f(1, uv, 0)      // scalar + vec2 + scalar
```

Swizzles (`.xy`, `.zw`, `.rgb`, `.ba`, etc.) return vector instances that work as constructor arguments: `d.vec4f(pos.xy, vel.zw)`.

**Prefer these overloads over manual component decomposition.** Instead of `d.vec3f(v.x, v.y, newZ)`, write `d.vec3f(v.xy, newZ)`.

Swizzles are also assignable, in JS and in `'use gpu'` code, with `=` and compound operators:

```ts
const color = d.vec4f(1, 0.5, 0.25, 1);
color.rgb *= 0.5;          // only rgb change
color.xw = d.vec2f(0, 1);  // components in any order, each at most once
```

The target must be mutable storage: a local variable, `tgpu.privateVar`/`workgroupVar`, or a mutable buffer. Uniform and readonly buffers, `tgpu.const`, temporaries (`d.vec2f(1, 2).xy = ...`) and non-pointer parameters are rejected. Repeated components (`v.xx = ...`) are a type error.

---

## Samplers and textures — three contexts, different syntax

| Context | Sampler | Sampled texture | Storage texture |
|---|---|---|---|
| Plain callback annotation | `d.sampler` | `d.texture2d<d.F32>` | `d.textureStorage2d<'rgba16float', 'read-only'>` |
| `tgpu.fn` signature array | `d.sampler()` | `d.texture2d(d.f32)` | `d.textureStorage2d('rgba16float', 'read-only')` |
| `tgpu.bindGroupLayout` | `{ sampler: 'filtering' }` | `{ texture: d.texture2d(d.f32) }` | `{ storageTexture: d.textureStorage2d(...) }` |

Comparison sampler: `d.comparisonSampler` / `d.comparisonSampler()`. Bind group layout sampler strings: `'filtering'`, `'non-filtering'`, `'comparison'`.

```ts
// Plain callback — interface types as annotations:
const sampleColor = (samp: d.sampler, tex: d.texture2d<d.F32>, uv: d.v2f) => {
  'use gpu';
  return std.textureSample(tex, samp, uv);
};
```

```ts
// tgpu.fn — factory calls in the schema array:
const sampleColorFn = tgpu.fn([d.sampler(), d.texture2d(d.f32), d.vec2f], d.vec4f)(
  (samp, tex, uv) => { 'use gpu'; return std.textureSample(tex, samp, uv); }
);
```

---

## CPU-side buffer types

Never use `any`. There are two construction paths, each with its own type:

### `root.createBuffer` — full control

Returns `TgpuBuffer<TData>`. Call `.$usage()` to add flags; each flag extends the type as an intersection:

```ts
import { type TgpuBuffer, type UniformFlag, type StorageFlag, type VertexFlag } from 'typegpu';

const buf: TgpuBuffer<d.F32> & UniformFlag =
  root.createBuffer(d.f32).$usage('uniform');
```

Available flags (all imported from `'typegpu'`): `UniformFlag`, `StorageFlag`, `VertexFlag`, `IndexFlag`, `IndirectFlag`.

### `root.createUniform / createMutable / createReadonly` — shorthands

Return dedicated types. Use these as function parameter types:

```ts
import { type TgpuUniform, type TgpuMutable, type TgpuReadonly } from 'typegpu';

const config: TgpuUniform<typeof Config> = root.createUniform(Config, { time: 0 });
const particles: TgpuMutable<typeof ParticleArray> = root.createMutable(ParticleArray);
const lut: TgpuReadonly<typeof LutArray> = root.createReadonly(LutArray);
```

`typeof Schema` is the idiomatic generic argument — `Config`, `ParticleArray`, etc. are schema objects created with `d.struct(...)` or `d.arrayOf(...)`.

These bindings are also accepted directly as `root.createBindGroup` entries (matching a `uniform`/`storage` layout entry with the right access) — no need to reach for the underlying buffer.

The same binding types are reachable from a manually created buffer: `buffer.as('uniform' | 'readonly' | 'mutable')` returns a `TgpuUniform`/`TgpuReadonly`/`TgpuMutable` (requires the matching `$usage`) — the bridge when you hold a `TgpuBuffer` but need `.$` access in a shader. Runtime type guards: `isBufferBinding`, `isUniformBinding`, `isReadonlyBinding`, `isMutableBinding`.

### Function parameters

Constrain only what you need:

```ts
// Accept any buffer holding a specific schema:
function upload(buf: TgpuBuffer<typeof Config>) { buf.write(...); }

// Require a specific usage:
function bindForRender(buf: TgpuBuffer<typeof Mesh> & VertexFlag) { ... }

// Accept either shorthand form:
function runSim(state: TgpuMutable<typeof SimState>) { ... }
```

### Schema-derived types

```ts
type ParticleInput = d.InferInput<typeof Particle>; // what .write() accepts
type ParticleGpu = d.InferGPU<typeof Particle>;     // the value inside 'use gpu' functions
type Particle = d.Infer<typeof Particle>;           // the value .read() returns
```

`d.AnyData` (also from `'typegpu/data'`) is the broadest schema constraint for generic helpers: `function upload<T extends d.AnyData>(buffer: TgpuBuffer<T>, value: d.InferInput<T>)`.

---

## Pointer schemas

Wrap a schema in the pointer constructor for the target address space to declare pointer-typed `tgpu.fn` parameters (out-params, atomics helpers): `d.ptrFn(schema)` (function-local), `d.ptrPrivate`, `d.ptrWorkgroup`, `d.ptrStorage`, `d.ptrUniform`. Workgroup/storage/uniform pointers as function parameters need WGSL's `unrestricted_pointer_parameters` extension — enabled automatically when available. Plain callbacks annotate pointer parameters as `d.ref<T>` instead, and callers create pointers with `d.ref(...)` (see `references/shaders.md`).

## Layout attribute schemas

`d.align(n, schema)` and `d.size(n, schema)` override alignment/size to match an externally defined WGSL layout — they take effect only as struct field types, not on standalone schemas. `d.location(n, schema)` pins an IO location; `d.interpolate('flat', schema)` sets interpolation (integer inter-stage varyings in a `vertexFn`/`fragmentFn` shell need `'flat'`; shell-less entry functions get it automatically); `d.invariant(schema)` marks the position builtin invariant.

## Schema introspection

`d.sizeOf(Schema)` and `d.alignmentOf(Schema)` return byte size and alignment. `d.schemasEqualStructurally(a, b)` compares shape (two `d.struct` calls with the same fields are equal); `d.schemasEqualNominally(a, b)` requires the same struct objects. All four also run inside `'use gpu'` code, where they fold to constants. Byte offsets of fields: `d.memoryLayoutOf` (see `references/buffers.md`).

## CPU-side texture types (`TgpuTexture<TProps>`)

Never use `any` for texture variables. `TgpuTexture` takes a `TextureProps` generic:

```ts
import { type TgpuTexture, type SampledFlag, type StorageFlag, type RenderFlag } from 'typegpu';

// Variable — let TypeScript infer when possible:
const tex = root.createTexture({ size: [512, 512], format: 'rgba16float' })
  .$usage('sampled', 'storage');
// inferred: TgpuTexture<{ size: [512, 512]; format: 'rgba16float' }> & SampledFlag & StorageFlag

// Named type alias (recommended for reuse):
type HdrTex = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> & SampledFlag;

// Function parameter — constrain only what you need:
function blur(src: TgpuTexture & SampledFlag, dst: TgpuTexture & StorageFlag) { ... }

// When format matters:
function loadIntoRgba8(tex: TgpuTexture<{ size: [number, number]; format: 'rgba8unorm' }>) { ... }
```

`$usage()` chains are intersection types — `& SampledFlag`, `& StorageFlag`, `& RenderFlag` — imported from `'typegpu'`. Use them in function signatures to express requirements without over-constraining the props generic.

**`TextureProps` fields** (all optional except `size` and `format`):

| Field | Type | Default |
|---|---|---|
| `size` | `[w]`, `[w, h]`, `[w, h, d]` | required |
| `format` | `GPUTextureFormat` | required |
| `dimension` | `'1d' \| '2d' \| '3d'` | `'2d'` |
| `mipLevelCount` | `number` | `1` |
| `sampleCount` | `number` | `1` (>1 = multisampled) |
| `viewFormats` | `GPUTextureFormat[]` | — |

# TypeGPU Type System & Literal Handling

Docs: https://docs.swmansion.com/TypeGPU/apis/data-schemas.md

## Abstract types — plain JS literals are usually enough

Plain JS numbers become abstract types that auto-convert without any cast in the generated WGSL:

| JS value | Abstract type | Resolves to |
|---|---|---|
| `0.96`, `1.5` (non-integer) | `abstractFloat` | `f32`, `f16` |
| `0`, `1`, `42` (integer) | `abstractInt` | `i32`, `u32`, `f32`, `f16` |

Write `0.88` as an arithmetic operand, not `d.f32(0.88)`, and `d.vec3f(0.52, 0.68, 0.12)` without per-element casts.

A literal's type comes from its value, not its spelling: `1.0` parses to the JS number `1`, an `abstractInt`. In an expression next to an `f32` it still converts; a declaration concretizes it to `i32`.

`d.f32()` is needed where a declaration sets the type:
- Declaring a float from a whole number: `let x = 1.0` and `let sum = 0` declare `i32`. Later float writes are converted to `i32` (`sum += 0.5` emits `sum += 0i`). Write `let sum = d.f32(0)`.
- Uninitialised variable: TypeScript annotations are stripped before transpilation, so `let x: number` and `let x: d.v3f` error. The WGSL type comes from the value: the constructor called, the buffer schema, or the abstract literal type. Use `let x = d.f32(0)`.

## Scalar division is floating-point

`/` on scalars always divides as floats. Integer operands become `f32` — `d.i32(10) / d.i32(3)` is `3.333...` — unless the other operand is `f16`, which keeps the division in `f16`. For integer scalar division use `std.intdiv(a, b)` (truncates toward zero). `d.i32(a / b)` also truncates, but it divides in `f32` first, so it loses precision above 2^24 and costs a float round-trip. Integer vectors divide as integers: `vec2i / vec2i` and `vec2i / 2` stay `vec2i`. `%` keeps the operand type.

## Vector constructors and swizzles

Constructors compose from any mix of scalars and smaller vectors that adds up to the right component count:

```ts
d.vec3f()              // zero-init: (0, 0, 0)
d.vec3f(1)             // broadcast:  (1, 1, 1)
d.vec3f(1, 2, 3)       // individual components
d.vec3f(someVec2, 1)   // vec2 + scalar
d.vec3f(1, someVec2)   // scalar + vec2
d.vec4f(rgb, 1)        // vec3 + scalar
d.vec4f(v2a, v2b)      // two vec2s
d.vec4f(1, uv, 0)      // scalar + vec2 + scalar
```

Swizzles (`.xy`, `.zw`, `.rgb`, `.ba`, etc.) return vectors that work as constructor arguments: write `d.vec3f(v.xy, newZ)`, not `d.vec3f(v.x, v.y, newZ)`.

Swizzles are also assignable, in JS and in `'use gpu'` code, with `=` and compound operators (compound operators in CPU code need `'use tsover'`, see `references/setup.md`):

```ts
const color = d.vec4f(1, 0.5, 0.25, 1);
color.rgb *= 0.5;          // only rgb change
color.xw = d.vec2f(0, 1);  // components in any order, each at most once
```

The target must be mutable storage: a local variable, `tgpu.privateVar`/`workgroupVar`, or a mutable buffer. Uniform and readonly buffers, `tgpu.const`, temporaries (`d.vec2f(1, 2).xy = ...`) and non-pointer parameters are rejected. Repeated components (`v.xx = ...`) are a type error. In shaders, multi-component swizzle writes need the `swizzle_assignment` WGSL language feature; without it, assign components one by one.

---

## Samplers and textures — three contexts, different syntax

| Context | Sampler | Sampled texture | Storage texture |
|---|---|---|---|
| Plain callback annotation | `d.sampler` | `d.texture2d<d.F32>` | `d.textureStorage2d<'rgba16float', 'read-only'>` |
| `tgpu.fn` signature array | `d.sampler()` | `d.texture2d(d.f32)` | `d.textureStorage2d('rgba16float', 'read-only')` |
| `tgpu.bindGroupLayout` | `{ sampler: 'filtering' }` | `{ texture: d.texture2d(d.f32) }` | `{ storageTexture: d.textureStorage2d(...) }` |

Comparison sampler: `d.comparisonSampler` / `d.comparisonSampler()`. Bind group layout sampler strings: `'filtering'`, `'non-filtering'`, `'comparison'`.

```ts
const sampleColor = (samp: d.sampler, tex: d.texture2d<d.F32>, uv: d.v2f) => {
  'use gpu';
  return std.textureSample(tex, samp, uv);
};

const sampleColorFn = tgpu.fn([d.sampler(), d.texture2d(d.f32), d.vec2f], d.vec4f)((samp, tex, uv) => {
  'use gpu';
  return std.textureSample(tex, samp, uv);
});
```

---

## CPU-side buffer types

Type helpers with the exported resource types rather than `any`. Each of the two construction paths has its own type:

### `root.createBuffer` — full control

Returns `TgpuBuffer<TData>`. Call `.$usage()` to add flags; each flag extends the type as an intersection:

```ts
import { type TgpuBuffer, type UniformFlag, type StorageFlag, type VertexFlag } from 'typegpu';

const buf: TgpuBuffer<d.F32> & UniformFlag =
  root.createBuffer(d.f32).$usage('uniform');
```

Available flags (all imported from `'typegpu'`): `UniformFlag`, `StorageFlag`, `VertexFlag`, `IndexFlag`, `IndirectFlag`. Shorter aliases for the common pairs: `TgpuUniformBuffer<T>`, `TgpuStorageBuffer<T>`, `TgpuVertexBuffer<T>`, `TgpuIndexBuffer<T>` (`TgpuBuffer<T> & UniformFlag`, ...).

### `root.createUniform / createMutable / createReadonly` — shorthands

Return dedicated types. Use these as function parameter types:

```ts
import { type TgpuUniform, type TgpuMutable, type TgpuReadonly } from 'typegpu';

const config: TgpuUniform<typeof Config> = root.createUniform(Config, { time: 0, scale: 1 }); // an initial value sets every field
const particles: TgpuMutable<typeof ParticleArray> = root.createMutable(ParticleArray);
const lut: TgpuReadonly<typeof LutArray> = root.createReadonly(LutArray);
```

The generic argument is `typeof Schema`. These bindings are accepted directly as `root.createBindGroup` entries for a `uniform`/`storage` layout entry with the matching access.

`buffer.as('uniform' | 'readonly' | 'mutable')` turns a `TgpuBuffer` with the matching `$usage` into a `TgpuUniform`/`TgpuReadonly`/`TgpuMutable`. Runtime type guards: `isBufferBinding`, `isUniformBinding`, `isReadonlyBinding`, `isMutableBinding`.

### Function parameters

Constrain only what the helper needs:

```ts
function upload(buf: TgpuBuffer<typeof Config>) { buf.write(...); }
function bindForRender(buf: TgpuBuffer<typeof Mesh> & VertexFlag) { ... }
function runSim(state: TgpuMutable<typeof SimState>) { ... }
```

The other resources have exported types for helper signatures too: `TgpuRoot`, `TgpuTextureView`, `TgpuSampler`, `TgpuComparisonSampler`, `TgpuBindGroupLayout`, `TgpuBindGroup`, `TgpuComputePipeline`, `TgpuRenderPipeline`, `TgpuVertexLayout`, `TgpuFn`, `TgpuSlot`, `TgpuAccessor`, `TgpuVar`, `TgpuConst`.

### Schema-derived types

```ts
type ParticleInput = d.InferInput<typeof Particle>; // what .write() accepts
type ParticleGpu = d.InferGPU<typeof Particle>;     // the value inside 'use gpu' functions
type Particle = d.Infer<typeof Particle>;           // the value .read() returns
```

`d.AnyData` (also from `'typegpu/data'`) is the broadest schema constraint for generic helpers: `function upload<T extends d.AnyData>(buffer: TgpuBuffer<T>, value: d.InferInput<T>)`.

---

## Pointer schemas

Wrap a schema in the pointer constructor for the target address space to declare pointer-typed `tgpu.fn` parameters (out-params, atomics helpers): `d.ptrFn(schema)` (function-local), `d.ptrPrivate`, `d.ptrWorkgroup`, `d.ptrStorage(schema, 'read' | 'read-write')` (default `'read'`), `d.ptrUniform`. Workgroup/storage/uniform pointer parameters use WGSL's `unrestricted_pointer_parameters` language extension, which needs no directive but must be in `navigator.gpu.wgslLanguageFeatures`. Plain callbacks annotate pointer parameters as `d.ref<T>` instead, and callers create pointers with `d.ref(...)` (see `references/shaders.md`).

## Layout attribute schemas

`d.align(n, schema)` and `d.size(n, schema)` override alignment/size to match an externally defined WGSL layout. WGSL `@align`/`@size` attributes are emitted only on struct fields; `d.sizeOf`, `d.alignmentOf` and buffer sizes honour them on standalone schemas too, and `d.arrayOf` rejects a decorated element. `d.location(n, schema)` pins an IO location; `d.interpolate('flat', schema)` sets interpolation (`'flat, either'` when any vertex's value will do; integer varyings: `references/shaders.md`); `d.invariant(schema)` marks the position builtin invariant.

## Schema introspection

`d.sizeOf(Schema)` and `d.alignmentOf(Schema)` return byte size and alignment. `d.schemasEqualStructurally(a, b)` compares shape (two `d.struct` calls with the same fields are equal); `d.schemasEqualNominally(a, b)` requires the same struct objects. All four also run inside `'use gpu'` code, where they fold to constants. Byte offsets of fields: `d.memoryLayoutOf` (see `references/buffers.md`).

## CPU-side texture types (`TgpuTexture<TProps>`)

`TgpuTexture` takes a `TextureProps` generic; `$usage()` adds `& SampledFlag`, `& StorageFlag`, `& RenderFlag`, all imported from `'typegpu'`. Let variables infer, and constrain helper parameters by flag, adding props only when they matter:

```ts
const tex = root.createTexture({ size: [512, 512], format: 'rgba16float' }).$usage('sampled', 'storage');
// TgpuTexture<{ size: [512, 512]; format: 'rgba16float' }> & SampledFlag & StorageFlag

type HdrTex = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> & SampledFlag;
function blur(src: TgpuTexture & SampledFlag, dst: TgpuTexture & StorageFlag) { ... }
function loadIntoRgba8(tex: TgpuTexture<{ size: [number, number]; format: 'rgba8unorm' }>) { ... }
```

The props generic takes the `root.createTexture` descriptor fields (`size`, `format`, `dimension`, `mipLevelCount`, `sampleCount`, `viewFormats`; defaults in `references/textures.md`).

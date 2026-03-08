# WebGL 2 Fallback for TypeGPU — Research Summary

## Overview

TypeGPU is currently WebGPU-only. This document summarizes the feasibility, design approach, and required changes for adding an optional WebGL 2 fallback via a new `tgpu.initWithFallback()` API. The fallback covers rendering-only workloads; compute is not supported in WebGL 2.

---

## Proposed API

```ts
import tgpu from 'typegpu';

// Tries WebGPU first; falls back to WebGL 2 if unavailable.
const root = await tgpu.initWithFallback();

// Same high-level API as WebGPU mode:
const color = root.createUniform(d.vec3f, d.vec3f(0, 1, 0));

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: () => { 'use gpu'; return d.vec4f(color.$, 1); },
});

const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
pipeline.withColorAttachment({ view: context }).draw(3);
```

When WebGPU is available, `initWithFallback()` returns the normal `TgpuRoot`. When it isn't, it returns a `TgpuRootWebGL` that renders through WebGL 2 with the same higher-level API surface.

---

## 1. Architecture Changes Required

### 1.1 Buffer / Resource Ownership

**Current**: `TgpuBufferImpl` (`src/core/buffer/buffer.ts:201`) grabs `root.device` in its constructor and directly calls `this.#device.createBuffer(...)` in the lazy `get buffer()` getter. The root's `unwrap(buffer)` is just `resource.buffer`. Buffers own their own GPU resource lifecycle.

**Problem**: This hardcodes `GPUDevice` into every resource, making the backend un-swappable.

**Fix**: Resources must delegate creation to the root, not hold the device themselves.

```ts
// Before (in TgpuBufferImpl constructor):
this.#device = root.device;
// ...in get buffer():
this._buffer = this.#device.createBuffer({ size, usage, ... });

// After:
this.#root = root;
// ...in get buffer():
this._buffer = this.#root.createGPUBuffer({ size, usage, ... });
```

The same pattern applies to `TgpuTextureImpl`, `TgpuSamplerImpl`, query sets, etc. They all reach for `root.device` or internal WebGPU APIs directly.

### 1.2 `root.device` and `root.unwrap()` in WebGL Mode

The `Unwrapper` interface (`src/unwrapper.ts`) exposes `readonly device: GPUDevice`. In WebGL mode both `root.device` and `root.unwrap(resource)` must throw:

```ts
get device(): GPUDevice {
  throw new Error('root.device is not available in WebGL fallback mode. Use the high-level TypeGPU API instead.');
}
```

### 1.3 `configureContext()` in WebGL Mode

Currently (`src/core/root/init.ts:421-432`) it calls `canvas.getContext('webgpu')`. In WebGL mode the implementation:
- Creates an internal `OffscreenCanvas` to host the WebGL 2 context (the actual render target)
- Stores the user-provided canvas as the *blit target*
- Returns an opaque handle that `withColorAttachment()` understands (not a `GPUCanvasContext`)
- Each draw call blits the rendered frame to the target canvas (see §3 below)

### 1.4 `Unwrapper` Interface

Consider splitting the `Unwrapper` interface so `device` is only present on the WebGPU root:

```ts
// Base root — no device
export interface TgpuRoot extends WithBinding { ... }

// WebGPU-specific extension
export interface TgpuRootWebGPU extends TgpuRoot, Unwrapper {
  readonly device: GPUDevice;
}
```

This lets `tgpu.init()` return `TgpuRootWebGPU` (richer type) while `initWithFallback()` returns `TgpuRoot` (no `device`/`unwrap`).

---

## 2. `initWithFallback()` Implementation

```ts
// src/core/root/initWithFallback.ts
export async function initWithFallback(options?: InitOptions): Promise<TgpuRoot> {
  if (navigator.gpu) {
    try {
      return await init(options); // Normal WebGPU path
    } catch {
      // Fall through to WebGL 2
    }
  }
  const offscreen = new OffscreenCanvas(1, 1);
  const gl = offscreen.getContext('webgl2');
  if (!gl) {
    throw new Error('Neither WebGPU nor WebGL 2 is available in this environment.');
  }
  return new TgpuRootWebGL(gl, offscreen);
}
```

All WebGL-specific code (the `TgpuRootWebGL` class, `GlslGenerator`, blit logic) lives in files that are only reachable via this function. When `initWithFallback` is never imported, bundlers tree-shake away all WebGL code. `unplugin-typegpu` needs no changes.

---

## 3. OffscreenCanvas Blit Strategy

**Question**: Is it possible to blit from a WebGL 2 OffscreenCanvas to a visible canvas without a RAM roundtrip?

**Answer**: Yes — the browser provides a zero-copy GPU→GPU path:

```
OffscreenCanvas (WebGL2 render)
  → offscreen.transferToImageBitmap()         // GPU texture, no RAM copy
  → ImageBitmapRenderingContext on visible canvas
  → ctx.transferFromImageBitmap(imageBitmap)  // GPU-to-GPU blit
```

Steps:
1. Create `OffscreenCanvas` and acquire a `WebGL2RenderingContext` from it
2. Render the scene to the offscreen canvas using WebGL 2
3. Call `offscreenCanvas.transferToImageBitmap()` — returns an `ImageBitmap` backed by the GPU texture (browser spec guarantees no CPU copy)
4. On the user's target canvas, acquire `ImageBitmapRenderingContext` via `canvas.getContext('bitmaprenderer')`
5. Call `bitmapCtx.transferFromImageBitmap(imageBitmap)` — composites directly on the GPU

The `ImageBitmap` is consumed (single-use) — the offscreen canvas allocates a fresh framebuffer for the next frame. This is the standard pattern for offscreen worker rendering and is well-supported across browsers.

`configureContext({ canvas })` stores the target canvas and its `ImageBitmapRenderingContext`. The blit fires at the end of each `.draw()` call.

---

## 4. GLSL Generation via `GlslGenerator`

Instead of using an external tool (e.g. Naga, Tint) to translate WGSL→GLSL, TypeGPU should implement a `GlslGenerator` that generates GLSL ES 3.0 **directly from the tinyest AST** — the same intermediate representation already used by `WgslGenerator`.

### 4.1 `WgslGenerator` Structure

`WgslGenerator` (`src/tgsl/wgslGenerator.ts`) implements the `ShaderGenerator` interface:

```ts
interface ShaderGenerator {
  initGenerator(ctx: GenerationCtx): void;
  block(body: Block, externalMap?: ExternalMap): string;
  functionDefinition(body: Block): string;
  identifier(id: string): Snippet;
  expression(expression: Expression): Snippet;
  typedExpression(expression: Expression, expectedType: BaseData): Snippet;
  statement(statement: Statement): string;
}
```

The expression/statement dispatch methods are largely language-agnostic (they traverse the tinyest AST). Language-specific tokens come from three sources:
- **`resolveData(ctx, dataType)`** — emits type name strings (`"vec4f"`, `"array<T, N>"`, struct definitions)
- **`OP_MAP`** — maps operator tokens to WGSL strings
- **Entry point wrappers** — `@vertex`/`@fragment` attributes, builtin I/O handling (outside the generator)

### 4.2 Proposed `GlslGenerator extends WgslGenerator`

Override only the methods/helpers that emit language-specific tokens:

| Override Target | WGSL Output | GLSL ES 3.0 Output |
|----------------|-------------|-------------------|
| `resolveData()` for scalars | `f32`, `u32`, `i32`, `bool` | `float`, `uint`, `int`, `bool` |
| `resolveData()` for vectors | `vec4f`, `vec2u`, `vec3i` | `vec4`, `uvec2`, `ivec3` |
| `resolveData()` for matrices | `mat4x4f`, `mat3x3f` | `mat4`, `mat3` |
| `resolveArray()` | `array<T, N>` | `T[N]` |
| `resolveStruct()` | `struct S { x: f32; y: f32; }` | `struct S { float x; float y; };` |
| `OP_MAP` additions | `dpdx`, `dpdy` | `dFdx`, `dFdy` |
| `blockVariable()` emission | `var x: f32 = …` | `float x = …` |
| Uniform binding syntax | `var<uniform> u: T` | `layout(binding=N) uniform BlockN { T u; }` |
| Vertex entry wrapper | `@vertex fn main(…) -> …` | `void main() { … gl_Position = … }` |
| Fragment entry wrapper | `@fragment fn main(…) -> @location(0) vec4f` | `layout(location=0) out vec4 out0; void main() { … }` |
| Built-in variables | `@builtin(position)` → output param | `gl_Position` (implicit) |
| Built-in inputs | `@builtin(vertex_index)` → input param | `gl_VertexID` |
| Built-in inputs | `@builtin(frag_coord)` | `gl_FragCoord` |

### 4.3 Splitting `WgslGenerator` Methods

Some `WgslGenerator` methods mix "reasoning" (data type decisions) with "code emission" (WGSL syntax). These need to be split so the GLSL subclass can override only the emission half. Example:

```ts
// Before (in WgslGenerator):
private blockVariable(kind: 'var'|'let'|'const', id: string, type: BaseData, origin: Origin): Snippet {
  // decision logic: determine kind from type...
  // emission: return snip(`var ${id}: ${typeName} = ${rhs}`, ...);
}

// After (in base class):
protected abstract emitVariableDeclaration(kind, id, typeName, rhs): string;

// In WgslGenerator:
protected emitVariableDeclaration(kind, id, typeName, rhs) {
  return `${kind} ${id}: ${typeName} = ${rhs}`;
}

// In GlslGenerator:
protected emitVariableDeclaration(kind, id, typeName, rhs) {
  return `${typeName} ${id} = ${rhs};`;
}
```

The number of such splits will be discovered during implementation — the principle is to pull out the smallest leaf methods that only emit tokens, keeping all semantic logic in the shared base.

### 4.4 Built-in Function Differences

Most WGSL built-ins map 1:1 to GLSL ES 3.0 (`mix`, `clamp`, `dot`, `length`, `normalize`, etc.). Overrides needed:

| WGSL | GLSL ES 3.0 |
|------|------------|
| `dpdx(v)` | `dFdx(v)` |
| `dpdy(v)` | `dFdy(v)` |
| `textureLoad(t, coord, level)` | `texelFetch(t, coord, level)` |
| `textureSampleGrad(…)` | `textureGrad(…)` |
| `bitcast<T>(v)` | `uintBitsToFloat(v)` / `floatBitsToUint(v)` etc. |
| `fma(a, b, c)` | `fma(a, b, c)` (GLSL ES 3.1+) or `a*b+c` |

These can be handled as special cases in `GlslGenerator.expression()` or by maintaining a GLSL-specific function name map.

---

## 5. WebGL 2 Feature Support Matrix

| Feature | WebGL 2 Status | Notes |
|---------|---------------|-------|
| Uniform buffers | ✓ Supported | `GL_UNIFORM_BUFFER` (UBOs); size ≥16 KB on mobile vs ≥64 KB WebGPU |
| Vertex/fragment shaders | ✓ Supported | Via `GlslGenerator` → GLSL ES 3.0 |
| Render pipelines | ✓ Supported | `gl.drawArrays` / `gl.drawElements` |
| Textures (2D, sampled) | ✓ Supported | Format subset; no BC/ETC2 guarantee |
| Render-to-texture | ✓ Supported | Framebuffer objects |
| `configureContext()` | ✓ Supported | OffscreenCanvas + `ImageBitmapRenderingContext` blit |
| Samplers | ✓ Supported | `gl.createSampler()` (WebGL 2) |
| Vertex / index buffers | ⚠ Partial | Map to WebGL VBOs/IBOs + VAOs |
| Storage buffers (`createMutable`/`createReadonly`) | ✗ Throws | No SSBOs in WebGL 2 |
| Compute pipelines (`createPipeline`) | ✗ Throws | No compute shaders in WebGL 2 |
| `root.device` | ✗ Throws | Not applicable; use high-level API |
| `root.unwrap(resource)` | ✗ Throws | Not applicable in WebGL mode |
| `f16` / `vec*h` types | ✗ Throws | `mediump` exists but has no guaranteed precision |
| Indirect dispatch/draw | ✗ Throws | Not in WebGL 2 |
| Query sets / timestamps | ✗ Throws | `EXT_disjoint_timer_query_webgl2` exists but limited |

---

## 6. Open Questions — Answered

### How do we simulate storage buffers and compute shaders?

We don't — at least not in the initial implementation. `createMutable()`, `createReadonly()`, and compute `createPipeline()` throw a `WebGLFallbackUnsupportedError` in WebGL mode with a message directing users to WebGPU.

For future consideration:
- **Transform feedback** can simulate simple vertex-level transforms (streaming particle updates etc.), but it's too narrow to replace general compute.
- **Render-to-texture via fragment shaders**: a fragment shader can write to textures via framebuffer attachments, enabling some compute-via-render patterns. This is already supported.

### How would drawing to a specific canvas work?

`configureContext({ canvas })` stores the user's canvas as the blit target. All rendering happens on the internal `OffscreenCanvas`; after each draw the result is blitted via `ImageBitmapRenderingContext`. Any canvas can be the target — same API as WebGPU.

---

## 7. New Files and Modified Files

### New Files

| File | Purpose |
|------|---------|
| `src/core/root/initWithFallback.ts` | `initWithFallback()` exported function |
| `src/core/root/tgpuRootWebGL.ts` | `TgpuRootWebGL` — WebGL 2 backend implementation |
| `src/tgsl/glslGenerator.ts` | `GlslGenerator extends WgslGenerator` |

### Modified Files

| File | Change |
|------|--------|
| `src/tgpu.ts` | Export `initWithFallback` |
| `src/core/buffer/buffer.ts` | Replace `#device` with `#root`; delegate `createBuffer` |
| `src/core/texture/texture.ts` | Same pattern |
| `src/core/sampler/sampler.ts` | Same pattern |
| `src/core/root/init.ts` | Extract backend interface; expose `createGPUBuffer` etc. |
| `src/core/root/rootTypes.ts` | Split `device` / `unwrap` to a `TgpuRootWebGPU` subtype |
| `src/unwrapper.ts` | Potentially make `device` optional or move to subtype |
| `src/tgsl/wgslGenerator.ts` | Split leaf code-emission methods for GLSL overriding |

---

## 8. Implementation Phases (Rough)

1. **Refactor resource ownership** — Remove direct `GPUDevice` references from buffers, textures, samplers. All resource creation goes through the root. This is prerequisite for everything else and should not change any public API.

2. **`GlslGenerator`** — Implement alongside (not instead of) `WgslGenerator`, splitting `wgslGenerator.ts` as needed. Cover: type names, struct/array syntax, operators, variable declarations. Entry point wrappers handled separately.

3. **`TgpuRootWebGL` skeleton** — Implements `TgpuRoot`, throws on unsupported operations (compute, `device`, `unwrap`). Wires up `GlslGenerator` for shader compilation.

4. **Render pipeline in WebGL** — Map `createRenderPipeline` → `gl.createProgram`, bind groups → UBOs, `draw()` → `gl.drawArrays`, `configureContext` → OffscreenCanvas + blit.

5. **`initWithFallback()`** — Wire everything together, export from `tgpu.ts`.

6. **Testing** — A small set of rendering-only examples verified to work in both WebGPU and WebGL 2 modes.

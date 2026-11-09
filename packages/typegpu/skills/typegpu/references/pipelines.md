# TypeGPU Pipelines and Vertex Buffers

Docs: https://docs.swmansion.com/TypeGPU/apis/pipelines.md, https://docs.swmansion.com/TypeGPU/apis/vertex-layouts.md

## Contents

- **Compute pipelines** — explicit entrypoints with a bounds check
- **Render pipelines** — creation, shell-less entry functions, default targets, depth-only pipelines, attachments, draw calls
- **WebGPU coordinate conventions** — NDC depth, framebuffer and UV origin, column-major matrices
- **Vertex layouts** — `tgpu.vertexLayout`, step modes, compact formats for `unstruct` / `disarrayOf`
- **Binding vertex buffers** — `.with(layout, buffer)`, `pipeline.pipe`
- **Wiring layouts into a render pipeline** — the `attribs` spread
- **Loading 3D models** — `@loaders.gl`, scattering attributes with `common.writeSoA`
- **Index buffers**
- **Depth / stencil**
- **Multiple render targets (MRT)** — named-record `out`, single-target shorthand, per-target blend and writeMask, custom `fragDepth` output, name and location matching, why fragment output is always 4-component
- **`common.fullScreenTriangle`**
- **Pipeline initialization** — `initSync` / `initAsync`, first-use compilation on WebKit, replacing size-dependent state
- **GPU timing** — pointer to `timing.md`
- **Recording a frame** — pointer to `encoders.md`
- **Resolve API** — WGSL code generation

## Compute pipelines

Write the entrypoint with an explicit workgroup size and guard the threads past the end of the data, then dispatch enough workgroups to cover it:

```ts
const COUNT = 10_000;
const values = root.createMutable(d.arrayOf(d.f32, COUNT));

const double = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x >= COUNT) {
    return;
  }

  values.$[gid.x] *= 2;
});

const pipeline = root.createComputePipeline({ compute: double });
pipeline.dispatchWorkgroups(Math.ceil(COUNT / 64));
```

Use `pipeline.with(bindGroup)` when the shader reads a bind group layout. 64 threads per workgroup (or `[8, 8]` for 2D work) is a good default; workgroup builtins (`localInvocationIndex`, `workgroupId`) and `tgpu.workgroupVar` need an explicit entrypoint.

`root.createGuardedComputePipeline(callback).dispatchThreads(...)` also exists: it picks the workgroup size and adds the bounds check, but its callback gets no builtins and it cannot record into a command encoder. Write the explicit form above.

## Render pipelines

```ts
const pipeline = root.createRenderPipeline({
  vertex: myVertex,
  fragment: myFragment,
  targets: { format: presentationFormat }, // single target shorthand
  // optional: attribs, primitive, depthStencil, multisample
});

pipeline
  .with(bindGroup)
  .withColorAttachment({ view: context }) // loadOp 'clear', storeOp 'store' by default
  .withDepthStencilAttachment({ view: depthTexture })
  .withIndexBuffer(indexBuffer) // enables .drawIndexed()
  .draw(vertexCount, instanceCount);
```

`primitive` is WebGPU's `GPUPrimitiveState`: `topology` (`'triangle-list'` by default, `'triangle-strip'`, `'line-list'`, `'line-strip'`, `'point-list'`), `cullMode`, `frontFace`; `stripIndexFormat` also accepts `d.u32` / `d.u16`.

`targets` is optional: a target without a `format` uses `navigator.gpu.getPreferredCanvasFormat()`. A fragment entrypoint's color outputs are 4-component (`d.vec4f`) even when the target format has fewer channels; see the MRT section. `fragment` is optional too: omit it (and `targets`) for a depth-only pass such as a shadow map, then attach only `withDepthStencilAttachment`.

`vertex` and `fragment` also accept shell-less `'use gpu'` callbacks. Builtins are `$`-prefixed keys (`$vertexIndex`, `$instanceIndex`, `$position`, `$frontFacing`, `$primitiveIndex`, `$fragDepth`, `$sampleMask`, ...); every other returned key is a varying, matched to the fragment input by name with locations assigned automatically. Integer varyings get flat interpolation automatically (shells require an explicit `d.interpolate('flat', ...)`). With `attribs`, a shell-less vertex receives each attribute under its key.

```ts
const pipeline = root.createRenderPipeline({
  vertex: ({ $vertexIndex: vid }) => {
    'use gpu';
    return { $position: d.vec4f(positions.$[vid], 0, 1), uv: uvs.$[vid] };
  },
  fragment: ({ uv }) => {
    'use gpu';
    return d.vec4f(uv, 0, 1);
  },
});
```

A shell-less fragment returns a `d.vec4f` for one target, or a record of `d.vec4f` outputs (plus `$fragDepth` / `$sampleMask`) for named targets. Use `tgpu.vertexFn` / `tgpu.fragmentFn` shells for explicit `d.location` / `d.interpolate` control, integer outputs (`d.vec4u` / `d.vec4i`), or an entry function reused across pipelines.

## WebGPU coordinate conventions

WebGPU matches DirectX/Metal, **not** OpenGL/WebGL. Porting tutorials verbatim causes subtle bugs:

- **NDC z is `[0, 1]`**, not `[-1, 1]`. A copied `gluPerspective` clips the near plane. Use `wgpu-matrix`'s `mat4.perspective` (already `[0, 1]`) or `mat4.perspectiveReverseZ`.
- **Framebuffer `(0, 0)` is top-left**, `+y` down. `d.builtin.position.xy` in a fragment shader is in pixels with this origin.
- **Texture UV `(0, 0)` is top-left**. Don't pre-flip `v`; `createImageBitmap` already matches.
- **Matrices are column-major**: `d.mat4x4f(c0, c1, c2, c3)` takes columns. In shaders use `mat.columns[c][r]`. Compose as `projection * view * model * position`. See `references/matrices.md`.

## Vertex layouts

`tgpu.vertexLayout(schemaFn, stepMode?)` describes how a vertex buffer maps to shader `in` parameters.

```ts
// Per-vertex (default):
const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));

// Per-instance:
const instanceLayout = tgpu.vertexLayout(d.arrayOf(InstanceData), 'instance');

// Loose layout - compact GPU vertex formats, no WGSL alignment rules:
const looseLayout = tgpu.vertexLayout(d.disarrayOf(d.unstruct({
  tilt:  d.f32,
  color: d.unorm8x4,
})), 'instance');
```

### Compact vertex formats (for `unstruct` / `disarrayOf`)

Reduce vertex bandwidth. Use inside `d.unstruct({...})`:

```ts
// Float
d.float32   d.float32x2   d.float32x3   d.float32x4
d.float16   d.float16x2   d.float16x4

// Unsigned integer
d.uint8     d.uint8x2     d.uint8x4
d.uint16    d.uint16x2    d.uint16x4
d.uint32    d.uint32x2    d.uint32x3    d.uint32x4

// Signed integer
d.sint8     d.sint8x2     d.sint8x4
d.sint16    d.sint16x2    d.sint16x4
d.sint32    d.sint32x2    d.sint32x3    d.sint32x4

// Normalised (integer packed float in [0,1] or [-1,1])
d.unorm8    d.unorm8x2    d.unorm8x4    d.unorm8x4_bgra
d.unorm16   d.unorm16x2   d.unorm16x4
d.snorm8    d.snorm8x2    d.snorm8x4
d.snorm16   d.snorm16x2   d.snorm16x4
d.unorm10_10_10_2
```

Compact-format buffers are restricted to `'vertex'` usage. To share memory with storage, use buffer reinterpretation (`references/advanced.md`).

---

## Wiring layouts into a render pipeline

The `attribs` field maps vertex layout attributes to shader `in` parameter names. For struct layouts, use the **spread trick**:

```ts
const VertexData   = d.struct({ position: d.vec3f, normal: d.vec3f, uv: d.vec2f });
const InstanceData = d.struct({ transform: d.vec4f, color: d.vec4f });

const vertexLayout   = tgpu.vertexLayout(d.arrayOf(VertexData));
const instanceLayout = tgpu.vertexLayout(d.arrayOf(InstanceData), 'instance');

const pipeline = root.createRenderPipeline({
  attribs: { ...vertexLayout.attrib, ...instanceLayout.attrib }, // spread both
  vertex:  mainVert,
  fragment: mainFrag,
  targets: { format: 'rgba8unorm' },
});
```

For a non-struct layout, `layout.attrib` is a single `TgpuVertexAttrib`:

```ts
attribs: vertexLayout.attrib              // name inferred from shader param
attribs: { pos: vertexLayout.attrib }     // explicit name mapping
```

Pick fields selectively:

```ts
attribs: {
  ...geometryLayout.attrib,
  center: dataLayout.attrib.position,   // rename/remap a field from another layout
}
```

Builtins (`d.builtin.vertexIndex`, etc.) are accessed directly via shader `in` - they do not go through `attribs`.

---

## Binding vertex buffers

Use `.with(layout, buffer)`. Can be pre-bound at creation or swapped per frame:

```ts
const prebound = pipeline.with(vertexLayout, vertexBuffer);

prebound
  .with(instanceLayout, instanceBuffers[frameIndex])
  .withColorAttachment({ view: renderView })
  .draw(3, instanceCount);
```

`pipeline.pipe(fn)` applies `fn` to the pipeline and returns its result, so a module can hand out one configuration step instead of a list of `with` calls:

```ts
const mesh = {
  vertices, indices,
  inject: () => <P extends TgpuRenderPipeline>(p: P) =>
    p.with(vertexLayout, mesh.vertices).withIndexBuffer(mesh.indices),
};
pipeline.pipe(mesh.inject()).drawIndexed(indexCount);
```

---

## Loading 3D models

Use `@loaders.gl/obj` or `@loaders.gl/gltf` to load meshes. loaders.gl returns separate flat typed arrays per attribute (positions, normals, UVs) — already SoA format. Combine with `common.writeSoA` to write them into the vertex buffer:

```ts
import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { common } from 'typegpu';

const mesh = await load('/model.obj', OBJLoader);
const vertexCount = mesh.attributes.POSITION.value.length / 3;

const vertexBuffer = root
  .createBuffer(vertexLayout.schemaForCount(vertexCount))
  .$usage('vertex');

common.writeSoA(vertexBuffer, {
  position: mesh.attributes.POSITION.value,   // Float32Array, packed xyz
  normal:   mesh.attributes.NORMAL.value,      // Float32Array, packed xyz
  uv:       mesh.attributes.TEXCOORD_0.value,  // Float32Array, packed uv
});
```

`writeSoA` scatters packed per-field arrays into the AoS GPU layout with correct padding — performant and convenient, no manual loops or per-vertex `d.vec3f()` allocations.

---

## Index buffers

```ts
const indexBuffer = root
  .createBuffer(d.arrayOf(d.u16, 6), [0, 2, 1, 0, 3, 2])
  .$usage('index');

pipeline
  .withIndexBuffer(indexBuffer)
  .drawIndexed(6);
```

Only arrays of `d.u16` or `d.u32` are valid.

---

## Depth / stencil

```ts
const depthTexture = root.createTexture({
  size: [width, height],
  format: 'depth24plus',
}).$usage('render');

pipeline
  .withDepthStencilAttachment({ view: depthTexture })
  .draw(vertexCount);
```

The depth attachment defaults to `depthLoadOp: 'clear'`, `depthStoreOp: 'store'`, `depthClearValue: 1`; stencil ops are filled in for formats with a stencil aspect. `pipeline.withStencilReference(ref)` sets the reference value used by the `stencilFront` / `stencilBack` ops.

Enable depth testing via `depthStencil` in `createRenderPipeline`:

```ts
root.createRenderPipeline({
  vertex: ..., fragment: ..., targets: ...,
  depthStencil: {
    format:            'depth24plus',
    depthWriteEnabled: true,
    depthCompare:      'less',
  },
});
```

With the default `depthClearValue: 1` and `depthCompare: 'less'`, near is `z = 0`. Reversed-Z: `depthClearValue: 0` with `depthCompare: 'greater'`, near at `z = 1` (NDC z is `[0, 1]`; see "WebGPU coordinate conventions").

---

## Multiple render targets (MRT)

Render pipelines accept a single target shorthand or a **named record**. With more than one colour output, all three sites (fragment `out`, pipeline `targets`, `withColorAttachment`) use the same keys. TypeScript rejects unknown keys in `targets` and missing ones in `withColorAttachment`; an output left out of `targets` gets the preferred canvas format.

```ts
const gBufferFrag = tgpu.fragmentFn({
  in:  { worldPos: d.vec3f, normal: d.vec3f },
  out: { albedo: d.vec4f, normal: d.vec4f, position: d.vec4f },
})((input) => {
  'use gpu';
  return {
    albedo:   d.vec4f(0.8, 0.2, 0.2, 1),
    normal:   d.vec4f(input.normal, 0),
    position: d.vec4f(input.worldPos, 1),
  };
});

const pipeline = root.createRenderPipeline({
  vertex: myVertex,
  fragment: gBufferFrag,
  targets: {
    albedo:   { format: 'rgba8unorm' },
    normal:   { format: 'rgba16float' },
    position: { format: 'rgba16float' },
  },
});

pipeline
  .with(bindGroup)
  .withColorAttachment({
    albedo:   { view: albedoView },
    normal:   { view: normalView },
    position: { view: positionView },
  })
  .draw(vertexCount);
```

> `albedoView`/`normalView`/`positionView` are cached at setup - see "Cache bind groups and views" in `references/buffers.md`.

### Single-target shorthand

```ts
fragment: tgpu.fragmentFn({ out: d.vec4f })(() => {
  'use gpu';
  return d.vec4f(1, 0, 0, 1);
}),
targets:  { format: 'bgra8unorm' },
// pipeline.withColorAttachment({ view: context })
```

Equivalent to a single named target. Switch to the keyed form once you need >=2 outputs or per-target config.

### Per-target blend, writeMask, etc.

Each entry in `targets` accepts the full `GPUColorTargetState`:

```ts
targets: {
  hdrColor: {
    format: 'rgba16float',
    blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one',       dstFactor: 'one',                 operation: 'add' },
    },
  },
  bloomMask: {
    format: 'r8unorm',
    writeMask: GPUColorWrite.RED,
  },
}
```

Per-target config is one of the main reasons to use the keyed form even with a single output.

### Custom depth output (`d.builtin.fragDepth`)

A fragment shader can write its own depth via the `fragDepth` builtin - useful for ray marching, impostors, anything not drawn at the rasterized depth. The builtin lives in the fragment `out` record, **but it is not a colour target** - it does not appear in `targets` or `withColorAttachment`. Depth still goes through `depthStencil` + `withDepthStencilAttachment`.

```ts
const fragMain = tgpu.fragmentFn({
  in:  { worldPos: d.vec3f },
  out: { color: d.vec4f, depth: d.builtin.fragDepth },
})((input) => {
  'use gpu';
  return {
    color: d.vec4f(shade(input.worldPos), 1),
    depth: customDepth(input.worldPos), // a number in [0, 1]
  };
});

const pipeline = root.createRenderPipeline({
  vertex: myVertex,
  fragment: fragMain,
  targets: {
    color: { format: presentationFormat }, // only `color` - `depth` NOT here
  },
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
});

pipeline
  .with(bindGroup)
  .withColorAttachment({
    color: { view: context },           // only `color`
  })
  .withDepthStencilAttachment({ view: depthTexture })
  .draw(vertexCount);
```

> **Common footgun:** writing `targets: { color: ..., depth: ... }` because the fragment has a `depth` output. Builtins (`fragDepth`, `sampleMask`) are control signals, not colour attachments. Only `d.vec4f` outputs become entries in `targets`.

### Name and location matching

- Keys in `targets` name fragment outputs (builtins excluded). TypeGPU assigns sequential `@location(N)` automatically; no `d.location(...)` needed.
- `withColorAttachment` takes one entry per output. TypeScript rejects missing/extra entries, and a missing one also throws at draw time.
- Varyings are matched between vertex `out` and fragment `in` by name, not location. Explicit `d.location(n, ...)` indices are kept and automatic ones fill the free numbers. Resolution throws when one varying carries different explicit locations on the two sides, or when two members share a location.

### Fragment output is always 4-component

Even for formats with fewer than 4 channels (`r8unorm`, `rg16float`), the output is still `d.vec4f` (`d.vec4i`/`d.vec4u` for integer formats). WebGPU drops unused channels.

```ts
const luminanceFrag = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  return d.vec4f(luma(input.uv), 0, 0, 1);
});

root.createRenderPipeline({
  vertex, fragment: luminanceFrag,
  targets: { format: 'r8unorm' }, // only the red channel is written
});
```

TypeGPU's fragment `out` accepts only 4-component vectors (plus builtins) - it does not derive narrower output types from texture formats.

---

## `common.fullScreenTriangle`

A helper for fullscreen post-processing - a single oversized triangle covering the viewport, no vertex buffer needed. It outputs `uv` (`(0, 0)` top-left) for the fragment to read.

```ts
import { common } from 'typegpu';

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
    'use gpu';
    return std.textureSample(screenView.$, sampler.$, input.uv); // a sampled texture view
  }),
  targets: { format: presentationFormat },
});

pipeline.withColorAttachment({ view: context }).draw(3);
```

---

## Pipeline initialization

Pipelines are lazy: shader resolution, module creation, and WebGPU pipeline creation all happen on the first `draw`/`dispatchWorkgroups`. To move that cost to a moment you control (e.g. a loading screen):

```ts
pipeline.initSync();          // start initialization now (JS side + issue device work)
await pipeline.initAsync();   // additionally wait until the device finishes - fully
                              // avoids the first-use stall
```

For small/medium shaders this makes no noticeable difference - use it only for large or numerous shaders.

### First use on WebKit

Safari/WebKit finishes building a pipeline's Metal state at its first draw or dispatch, even after `initAsync()`. With a cold shader cache, the frame that first uses a pipeline can stall for a few hundred milliseconds; repeat visits are smooth because the cache persists. Chrome compiles at creation.

If that stall matters, use each pipeline once under the loading screen: one draw into a tiny target with the pipeline's formats and sample count, or one small dispatch. The cost is per pipeline (each distinct texture type a stage reads adds roughly 100-200 ms), so share one pipeline across variants that differ only in data (uniforms, instance-index bits) and pass large constant tables through module-scope data rather than by value. Test this in WebKit with a cold cache.

### Replacing size-dependent state

Change only the layer that changed:

| Change | Action |
|---|---|
| A uniform the shader reads (gain, time, camera) | Write the buffer; keep textures and pipelines |
| Render target size | Destroy and recreate the textures and the bind groups and views that wrap them |
| Callback, slot value or output format baked into a shader | Create the corresponding pipeline variant |
| Device lost or root replaced | Recreate everything that came from the root |

When the replacement is prepared with `initAsync`, keep drawing with the old state until it's ready, then swap and destroy the old one. If several resizes are in flight, publish only the latest and destroy the others. Swap between frames: destroying resources that recorded but unsubmitted commands use makes the submission fail.

---

## GPU timing

`pipeline.withPerformanceCallback((start: bigint, end: bigint) => ...)` for quick one-off measurement; `root.createQuerySet('timestamp', n)` + `pipeline.withTimestampWrites(...)` for durable multi-pass timing. Both need the `timestamp-query` device feature: without it `withPerformanceCallback` logs a warning and skips timing, and `withTimestampWrites` throws. Allocation behavior, the `available` guard, and how to interpret overlapping pass timings: `references/timing.md`.

---

## Recording a frame

`draw()`, `drawIndexed()` and `dispatchWorkgroups()` each record and submit their own single-pipeline pass. Indirect variants (`drawIndirect`, `drawIndexedIndirect`, `dispatchWorkgroupsIndirect`) read their counts from a buffer; see `references/advanced.md`. Per frame, record all work into one `root.createCommandEncoder()` and submit once: `pipeline.with(encoder)` for a pass with a single pipeline, `pipeline.with(pass)` for pipelines sharing a pass. See `references/encoders.md`, which also covers render bundles and raw-WebGPU encoder interop.

---

## Resolve API (WGSL code generation)

`tgpu.resolve` generates complete WGSL, with all transitive dependencies (helpers, layouts, buffers, constants) included and deduplicated automatically:

```ts
const wgsl = tgpu.resolve([pipeline]); // debugging, tooling, shader inspection
```

Several pipelines can be resolved in one call; all items must originate from the same root (mixing roots throws). `config: (cfg) => cfg.with(slot, value)` binds slots and accessors for a standalone resolve.

There's also a raw-WGSL interop form, `tgpu.resolve({ template, externals })` - each `externals` entry (even objects with member access, e.g. `randf.sample`) becomes available inside the WGSL `template` string. Niche; only for injecting TypeGPU objects into existing hand-written WGSL.

Options: `names: 'strict'` (default - generated names follow the JS identifiers the build plugin records, sanitized and suffixed on conflict) or `'random'`.

`tgpu.resolveWithContext(...)` additionally returns `usedBindGroupLayouts` and a `catchall` bind group. Sharing one naming scope across several resolve calls (`tgpu['~unstable'].namespace()`): `references/advanced.md`.

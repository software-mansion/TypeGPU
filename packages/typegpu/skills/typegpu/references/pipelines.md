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
- **Multiple render targets (MRT)** — named-record `out`, single-target shorthand, blend and writeMask, custom `fragDepth` output, name and location matching, 4-component outputs
- **`common.fullScreenTriangle`**
- **Pipeline initialization** — `initSync` / `initAsync`, first-use compilation on WebKit, replacing size-dependent state
- **Timing and recording a frame** — pointers to `timing.md` and `encoders.md`
- **Resolve API** — WGSL code generation

## Compute pipelines

An explicit workgroup size, a bounds check, and enough workgroups to cover the data:

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

Use `pipeline.with(bindGroup)` when the shader reads a bind group layout. 64 threads per workgroup (or `[8, 8]` for 2D work) is a good default; workgroup builtins (`localInvocationIndex`, `workgroupId`) need an explicit entrypoint, and so does a kernel with `std.workgroupBarrier()`: the guarded form below returns early on out-of-range threads.

`root.createGuardedComputePipeline(callback).dispatchThreads(...)` picks the workgroup size and adds the bounds check, but its callback gets no builtins and it cannot record into a pass or encoder: each `dispatchThreads` submits on its own. Write the explicit form above.

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

`targets` is optional: a target without a `format` uses `navigator.gpu.getPreferredCanvasFormat()`. `fragment` is optional too: omit it (and `targets`) for a depth-only pass such as a shadow map, then attach only `withDepthStencilAttachment`.

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

WebGPU follows DirectX/Metal conventions, not OpenGL/WebGL:

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

Compact formats cut vertex bandwidth inside `d.unstruct({...})`:

- `d.float32`, `d.uint32`, `d.sint32` with `x2`, `x3`, `x4` variants (`d.float32x3`).
- `d.float16`, `d.uint8`, `d.uint16`, `d.sint8`, `d.sint16` and the normalized `d.unorm8`, `d.unorm16`, `d.snorm8`, `d.snorm16` (integers read as floats in `[0, 1]` or `[-1, 1]`) with `x2` and `x4` variants only.
- `d.unorm8x4_bgra`, `d.unorm10_10_10_2`.

Compact-format buffers are restricted to `'vertex'` usage. To share memory with storage, use buffer reinterpretation (`references/advanced.md`).

---

## Wiring layouts into a render pipeline

`attribs` maps vertex layout attributes to shader `in` parameter names. A struct layout's `attrib` is a record of attributes; spread it:

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

For a non-struct layout, `layout.attrib` is a single `TgpuVertexAttrib`; map it to the vertex input by name:

```ts
attribs: { pos: vertexLayout.attrib }
```

Pick fields selectively:

```ts
attribs: {
  ...geometryLayout.attrib,
  center: dataLayout.attrib.position,   // rename/remap a field from another layout
}
```

Builtins (`d.builtin.vertexIndex`, ...) come through the shader `in` directly, not `attribs`.

---

## Binding vertex buffers

`.with(layout, buffer)` binds a vertex buffer, once at setup or per frame:

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

`@loaders.gl/obj` and `@loaders.gl/gltf` return one flat typed array per attribute, which `common.writeSoA` scatters into the vertex buffer with correct padding:

```ts
import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { common } from 'typegpu';

const mesh = await load('/model.obj', OBJLoader);
const vertexCount = mesh.attributes.POSITION.value.length / 3;

const vertexBuffer = root
  .createBuffer(vertexLayout.schemaForCount(vertexCount))
  .$usage('vertex');

// loaders.gl types attribute values as TypedArray; OBJ data is Float32Array
common.writeSoA(vertexBuffer, {
  position: mesh.attributes.POSITION.value as Float32Array,   // packed xyz
  normal:   mesh.attributes.NORMAL.value as Float32Array,     // packed xyz
  uv:       mesh.attributes.TEXCOORD_0.value as Float32Array, // packed uv
});
```

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

Attachment op defaults are listed under "Recording a frame" in `references/encoders.md`. `pipeline.withStencilReference(ref)` sets the reference value used by the `stencilFront` / `stencilBack` ops. Depth testing is enabled by `depthStencil` in `createRenderPipeline`:

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

### Single-target shorthand, blend and writeMask

A fragment with `out: d.vec4f` takes `targets: { format }` and `withColorAttachment({ view })`, equivalent to a single named target. The shorthand and each keyed entry take the full `GPUColorTargetState`:

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

### Custom depth output (`d.builtin.fragDepth`)

A fragment shader can write its own depth through the `fragDepth` builtin (ray marching, impostors). Builtins in `out` (`fragDepth`, `sampleMask`) are not colour targets: leave them out of `targets` and `withColorAttachment`, which take only colour outputs (`d.vec4f`, `d.vec4i`, `d.vec4u`). Depth still goes through `depthStencil` and `withDepthStencilAttachment`.

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
  targets: { color: { format: presentationFormat } },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
});

pipeline
  .withColorAttachment({ color: { view: context } })
  .withDepthStencilAttachment({ view: depthTexture })
  .draw(vertexCount);
```

### Name and location matching

- Keys in `targets` name fragment outputs (builtins excluded). TypeGPU assigns sequential `@location(N)` automatically; no `d.location(...)` needed. An explicit `d.location(n, ...)` on an output is kept, and its target moves to that index.
- `withColorAttachment` takes one entry per output. TypeScript rejects missing/extra entries, and a missing one also throws at draw time.
- Varyings are matched between vertex `out` and fragment `in` by name, not location. Explicit `d.location(n, ...)` indices are kept and automatic ones fill the free numbers. Resolution throws when one varying carries different explicit locations on the two sides, or when two members share a location.

### Fragment output is always 4-component

For formats with fewer channels (`r8unorm`, `rg16float`) the output is still `d.vec4f` (`d.vec4i`/`d.vec4u` for integer formats), and WebGPU drops the unused channels. Fragment `out` accepts only 4-component vectors (plus builtins); TypeGPU doesn't derive narrower types from the format.

---

## `common.fullScreenTriangle`

A vertex function drawing one oversized triangle over the viewport, with no vertex buffer. It outputs `uv` (`(0, 0)` top-left) for the fragment.

```ts
import { common } from 'typegpu';

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
    'use gpu';
    return std.textureSample(screenView.$, sampler.$, input.uv);
  }),
  targets: { format: presentationFormat },
});

pipeline.withColorAttachment({ view: context }).draw(3);
```

---

## Pipeline initialization

Pipelines are lazy: shader resolution, module creation and WebGPU pipeline creation happen on the first `draw`/`dispatchWorkgroups`. To move that cost to a moment you control (e.g. a loading screen):

```ts
pipeline.initSync();          // JS side now, device work issued
await pipeline.initAsync();   // also waits for the device, avoiding the first-use stall
```

For small and medium shaders this makes no noticeable difference; it matters for large or numerous shaders.

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

## Timing and recording a frame

GPU timing (`withPerformanceCallback`, `withTimestampWrites`, query sets) is in `references/timing.md`.

`draw()`, `drawIndexed()` and `dispatchWorkgroups()` each record and submit their own single-pipeline pass; record a frame into one `root.createCommandEncoder()` instead (`references/encoders.md`). Indirect variants (`drawIndirect`, `drawIndexedIndirect`, `dispatchWorkgroupsIndirect`) read their counts from a buffer; see `references/advanced.md`.

---

## Resolve API (WGSL code generation)

`tgpu.resolve([pipeline])` generates complete WGSL with all transitive dependencies (helpers, layouts, buffers, constants), deduplicated. Several pipelines can be resolved in one call; all items must come from the same root (mixing roots throws). Resolving in tests, `config` and `enableExtensions` for a standalone resolve: `references/debugging.md`.

`tgpu.resolve({ template, externals })` injects TypeGPU objects into hand-written WGSL: each `externals` entry (even objects with member access, e.g. `randf.sample`) becomes available inside the `template` string.

`names: 'strict'` (default) names generated code after the JS identifiers the build plugin records, sanitized and suffixed on conflict; `'random'` is the alternative.

`tgpu.resolveWithContext(...)` takes the same arguments and returns `{ code, usedBindGroupLayouts, catchall }`. Sharing one naming scope across several resolve calls (`tgpu['~unstable'].namespace()`): `references/advanced.md`.

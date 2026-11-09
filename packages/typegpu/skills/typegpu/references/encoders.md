# Command Encoders, Passes, and Render Bundles

Docs: https://docs.swmansion.com/TypeGPU/apis/pipelines.md (sections "Command encoders and passes", "Immediates").

By default, `pipeline.draw()` and `pipeline.dispatchWorkgroups()` each record their own single-pipeline pass and submit it immediately. A frame with more than one pipeline records into one command encoder and submits once: **several pipelines in one pass** (shared attachments, e.g. scene + lights + sky into one MSAA target) and **several passes in one submission**.

## Recording a frame

```ts
const encoder = root.createCommandEncoder();

simulate.with(encoder).dispatchWorkgroups(Math.ceil(COUNT / 64));

const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: msaaTexture,        // TypeGPU texture/view, canvas context, or GPUTextureView
    resolveTarget: context,
  }],
  depthStencilAttachment: {
    view: depthTexture,
  },
});

scenePipeline.with(pass).draw(mesh.vertexCount);
lightPipeline.with(pass).draw(6, lightCount);
skyPipeline.with(pass).draw(3);

pass.end();
encoder.submit();
```

`pipeline.with(encoder)` opens and ends a pass of its own for each draw or dispatch; use it for a pass that runs one pipeline (render pipelines still take `.withColorAttachment(...)`). Open a pass with `beginRenderPass` / `beginComputePass` when several pipelines or draws share it.

Descriptor conveniences over raw `GPURenderPassDescriptor`:

- Attachment `view` accepts TypeGPU textures, texture views, and canvas contexts, as well as raw `GPUTextureView`s.
- `loadOp` / `storeOp` default to `'clear'` / `'store'`; depth defaults to `'clear'` / `'store'` with `depthClearValue: 1`, and stencil ops are filled in when the view's format has a stencil aspect. Give a raw stencil or depth-stencil `GPUTextureView` explicit ops.
- A single color attachment doesn't need to be wrapped in an array.
- `occlusionQuerySet` / `timestampWrites` accept TypeGPU query sets.

## Two equivalent execution styles

`pipeline.with(pass).draw(...)` keeps the pipeline-centric API (all `with*` methods available). Alternatively the pass mirrors `GPURenderPassEncoder`, accepting TypeGPU resources:

```ts
pass.setPipeline(renderPipeline);
pass.setBindGroup(bindGroup);
pass.setVertexBuffer(vertexLayout, vertexBuffer);
pass.draw(3);
```

Both styles share one pass state, applied lazily at draw time and only when it changed since the previous draw. Precedence: state set on the pass (`pass.set*`) wins over state held by the pipeline (`pipeline.with*`), which wins over WebGPU defaults. Pass state persists across draws and pipeline switches until overwritten; pipeline-held state applies only to that pipeline's draws. Footgun: `pipeline.with(pass).draw(...)` sets the pass's current pipeline — a subsequent bare `pass.draw(...)` runs *that* pipeline, not one set earlier via `setPipeline`.

Draws through any `with(pass)` wrapper of one pipeline count as the same pipeline, so per-draw `with` calls re-apply only what changed:

```ts
for (const object of objects) {
  scenePipeline.with(pass).with(object.bindGroup).draw(object.vertexCount);
}
```

Each `with*` call allocates a small wrapper object; the GPU-side state is still set once.

## Compute passes

```ts
const pass = encoder.beginComputePass();
integrate.with(pass).dispatchWorkgroups(Math.ceil(COUNT / 64));
collide.with(pass).dispatchWorkgroups(Math.ceil(COUNT / 64));
pass.end();
```

Guarded compute pipelines (`createGuardedComputePipeline` / `dispatchThreads`) cannot record into passes or encoders — each `dispatchThreads` submits on its own, which is one more reason to write explicit compute entrypoints (`references/pipelines.md`).

## Immediates (per-draw values without buffers)

> **Unstable and not portable.** `tgpu['~unstable'].immediateVar` needs the `immediate_address_space` WGSL language feature, which few platforms expose yet (Chrome 149+ with capable hardware). Check `root.enabledWgslLanguageFeatures.has('immediate_address_space')` at runtime and always keep a fallback path.

Immediates are WebGPU's push constants: a small value set per draw or dispatch, directly on the pass. An accessor lets the same shader read either an immediate or a buffer:

```ts
const params = tgpu.bindGroupLayout({ tint: { uniform: d.vec4f } });
const tint = tgpu.accessor(d.vec4f, () => params.$.tint); // shader reads tint.$

const tintImmediate = root.enabledWgslLanguageFeatures.has('immediate_address_space')
  ? tgpu['~unstable'].immediateVar(d.vec4f)
  : undefined;
const pipeline = (tintImmediate ? root.with(tint, tintImmediate) : root)
  .createRenderPipeline({ vertex, fragment, targets: { format } });

for (const object of objects) {
  if (tintImmediate) {
    pass.setImmediates(tintImmediate, object.tint); // or a Float32Array, copied verbatim
  } else {
    pass.setBindGroup(object.tintBindGroup); // one uniform buffer + bind group per value
  }
  pipeline.with(pass).draw(object.vertexCount);
}
```

- **Where values come from:** `pipeline.with(immediate, value)` holds a value on the pipeline, and `pass.setImmediates` overrides it. The variable's optional default (`immediateVar(schema, default)`) is the last resort. Drawing with no value throws `MissingImmediatesError`.
- **Values are serialized when set.** Mutating the source object afterwards has no effect.
- **Limits:** one immediate variable per shader, so group several values in a struct. No arrays, atomics or booleans. The size must be a multiple of 4 bytes and fit `maxImmediateSize` (64 bytes by default; request more via `tgpu.init({ device: { requiredLimits: { maxImmediateSize: 128 } } })` where supported).
- **Fallback:** a single uniform written with `buffer.write` between draws does not work: queue writes are not recorded between draws, so every draw would see the last value. Use one buffer and bind group per distinct value, as above. When one variable holds either an immediate or a uniform, `isImmediateVar(x)` (exported from `typegpu`) tells them apart.

Test the fallback explicitly: a recent desktop Chrome usually takes the immediate path.

## `submit()` vs `finish()`

- `encoder.submit()` finishes and submits to the device queue; shader `console.log` output and performance callbacks are processed as part of that submission.
- `encoder.finish()` returns the raw `GPUCommandBuffer` for manual `device.queue.submit([...])` batching — TypeGPU never sees that submission, so **logs and performance callbacks are not processed**.

## Render bundles

Pre-record a static draw sequence once, replay it cheaply every frame:

```ts
const bundleEncoder = root.createRenderBundleEncoder({
  colorFormats: ['rgba8unorm'],  // must match the pass it will run in
});
scenePipeline.with(bundleEncoder).draw(vertexCount);
const bundle = bundleEncoder.finish();

// each frame:
pass.executeBundles([bundle]);
```

## Raw WebGPU interop

Pipelines also accept raw WebGPU encoders via `.with(...)`:

- `pipeline.with(gpuCommandEncoder)` — TypeGPU opens and ends the needed pass; you finish/submit the encoder.
- `pipeline.with(gpuRenderPass | gpuComputePass)` — state is applied to the existing pass without ending it; you end it.
- `pipeline.with(gpuRenderBundleEncoder)` — records draws into the bundle; you finish it.

Same logging caveat as `finish()`: TypeGPU can't process shader logs or perf callbacks for submissions it doesn't own.

Escape hatch in the other direction: `root.unwrap(encoder)` / `root.unwrap(pass)` return the raw `GPUCommandEncoder` / pass encoder (e.g. for texture copies). Commands recorded raw are invisible to TypeGPU, so after unwrapping a pass, the next typed draw re-applies its full state.

## Encoder-aware buffer ops

`buffer.clear(encoder)` and `dst.copyFrom(src, encoder)` record into the given encoder instead of submitting immediately — use them to fold buffer maintenance into the same submission as your passes.

## Reusable operations in a caller's frame

An operation that other code composes into its frame (a blur, a prefix sum, a simulation step) should create its pipelines and buffers once and record into whatever the caller passes in:

```ts
function createBlur(root: TgpuRoot, input: TgpuTexture, output: TgpuTexture) {
  // create pipelines, bind groups and scratch textures once
  return {
    run(target?: { pass?: TgpuComputePass; encoder?: TgpuCommandEncoder }) {
      // record into target.pass, or open a pass on target.encoder,
      // or submit standalone work when neither is given
    },
    destroy() {
      // destroy only what this operation allocated
    },
  };
}
```

- Leave a supplied pass open and a supplied encoder unsubmitted. Never store the pass or encoder in the operation.
- Borrowed buffers and textures (inputs, a caller-provided output) stay alive after `destroy()`.
- Optional `initAsync()` lets callers prepare the pipelines under a loading screen; recording stays synchronous.

## Synchronization in compute work

- A kernel with `std.workgroupBarrier()` needs every thread of the workgroup to reach it. Don't `return` out-of-range threads before the barrier; skip their loads and stores and feed an identity value instead.
- Barriers don't synchronize separate workgroups. A phase that needs results from every workgroup is a separate dispatch; dispatches in one pass see each other's writes in order.
- Updates that read neighbours need separate input and output storage. For ping-pong over `n` steps, track which buffer holds the result (it depends on whether `n` is odd). Two bindings of the same buffer still alias.
- Keep GPU-produced counts on the GPU and feed them to indirect dispatch or draw (see `references/advanced.md`) instead of reading them back.

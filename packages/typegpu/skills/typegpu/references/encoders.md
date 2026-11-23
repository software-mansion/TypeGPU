# Command Encoders, Passes, and Render Bundles

Docs: https://docs.swmansion.com/TypeGPU/apis/pipelines.md (sections "Command encoders and passes", "Immediates").

A bare `pipeline.draw()` or `dispatchWorkgroups()` records its own single-pipeline pass and submits it immediately. A frame records into one command encoder and submits once, with several passes per submission and several pipelines per pass when they share attachments (e.g. scene, lights and sky into one MSAA target).

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

`pipeline.with(encoder)` opens and ends a pass of its own for each draw or dispatch; use it for a pass that runs one pipeline (render pipelines still take `.withColorAttachment(...)`). Open a pass with `beginRenderPass` / `beginComputePass` when several pipelines or draws share it. In a shared pass the pass descriptor owns attachments and timestamp writes: `withColorAttachment`, `withDepthStencilAttachment` and `withTimestampWrites` on the pipeline are ignored there, with a warning. Buffer `clear(encoder)` and `copyFrom(src, encoder)` record into the encoder too (`references/buffers.md`).

Descriptor conveniences over raw `GPURenderPassDescriptor`:

- Attachment `view` accepts TypeGPU textures, texture views, and canvas contexts, as well as raw `GPUTextureView`s.
- `loadOp` / `storeOp` default to `'clear'` / `'store'`, here and in a pipeline's `withColorAttachment` / `withDepthStencilAttachment`; depth ops default the same, with `depthClearValue: 1`, and stencil ops are filled in when the view's format has a stencil aspect. Give a raw stencil or depth-stencil `GPUTextureView` explicit ops.
- A single color attachment doesn't need to be wrapped in an array. Several are positional: list them in `@location` order, with `null` for an unused location.
- Attachments on `'transient'` textures need `loadOp: 'clear'` and `storeOp: 'discard'` (and `depthLoadOp` / `depthStoreOp`, stencil likewise); the `'store'` default fails validation.
- A pass reopened over earlier contents (a second pass drawing onto the same target) needs `loadOp: 'load'` to keep them.
- `occlusionQuerySet` / `timestampWrites` accept TypeGPU query sets.

## Two equivalent execution styles

`pipeline.with(pass).draw(...)` keeps every `with*` method. Alternatively the pass mirrors `GPURenderPassEncoder`, accepting TypeGPU resources:

```ts
pass.setPipeline(renderPipeline);
pass.setBindGroup(bindGroup);
pass.setVertexBuffer(vertexLayout, vertexBuffer);
pass.draw(3);
```

The render pass also has `setIndexBuffer(buffer, format)`, `setViewport`, `setScissorRect`, `setBlendConstant`, `setStencilReference`, `beginOcclusionQuery` / `endOcclusionQuery` and `executeBundles`, as in WebGPU.

Both styles share one pass state, applied lazily at draw time. It is applied as a whole: a draw after any change (another pipeline, bind group or buffer) re-sets the pipeline, every bind group and the vertex and index buffers, and consecutive draws with nothing changed set nothing. Precedence: state set on the pass (`pass.set*`) wins over state held by the pipeline (`pipeline.with*`), which wins over WebGPU defaults. Pass state persists across draws and pipeline switches until overwritten; pipeline-held state applies only to that pipeline's draws. `pipeline.with(pass).draw(...)` also makes that pipeline the pass's current one, so a later bare `pass.draw(...)` runs it rather than one set earlier with `setPipeline`.

Repeated `pipeline.with(pass)` draws count as one pipeline, so nothing changes between them. A wrapper that also carries a bind group (`.with(pass).with(group)`) is a new pipeline each time it is made, so this per-object loop re-sets the full state on every draw, a few extra encoder calls per object:

```ts
for (const object of objects) {
  scenePipeline.with(pass).with(object.bindGroup).draw(object.vertexCount);
}
```

Each `with*` call allocates a small wrapper object.

## Compute passes

```ts
const pass = encoder.beginComputePass();
integrate.with(pass).dispatchWorkgroups(Math.ceil(COUNT / 64));
collide.with(pass).dispatchWorkgroups(Math.ceil(COUNT / 64));
pass.end();
```

Guarded compute pipelines (`dispatchThreads`) cannot record into a pass (`references/pipelines.md`).

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

- `pipeline.with(immediate, value)` holds a value on the pipeline, and `pass.setImmediates` overrides it. The variable's optional default (`immediateVar(schema, default)`) is the last resort. Drawing with no value throws `MissingImmediatesError`.
- Values are serialized when set: mutating the source object afterwards has no effect.
- One immediate variable per shader, so group several values in a struct. No arrays, atomics or booleans. The size must be a multiple of 4 bytes and fit `maxImmediateSize` (64 bytes by default; request more via `tgpu.init({ device: { requiredLimits: { maxImmediateSize: 128 } } })` where supported).
- Fallback: a single uniform written with `buffer.write` between draws does not work: queue writes are not recorded between draws, so every draw would see the last value. Use one buffer and bind group per distinct value, as above. When one variable holds either an immediate or a uniform, `isImmediateVar(x)` (exported from `typegpu`) tells them apart.

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

Escape hatch in the other direction: `root.unwrap(encoder)` / `root.unwrap(pass)` return the raw `GPUCommandEncoder` / pass encoder (e.g. for texture copies). Commands recorded raw are invisible to TypeGPU, so after unwrapping a pass, every later typed draw in that pass re-applies its full state.

## Reusable operations in a caller's frame

An operation that other code composes into its frame (a blur, a prefix sum, a simulation step) creates its pipelines and buffers once and records into whatever the caller passes in:

```ts
function createBlur(root: TgpuRoot, input: TgpuTexture, output: TgpuTexture): {
  run(target?: { pass?: TgpuComputePass; encoder?: TgpuCommandEncoder }): void;
  destroy(): void;
};
```

- The factory creates pipelines, bind groups and scratch textures. `run` records into `target.pass`, opens a pass on `target.encoder`, or submits standalone work when neither is given. `destroy` frees only what the operation allocated.
- Leave a supplied pass open and a supplied encoder unsubmitted. Never store the pass or encoder in the operation.
- Borrowed buffers and textures (inputs, a caller-provided output) stay alive after `destroy()`.
- Optional `initAsync()` lets callers prepare the pipelines under a loading screen; recording stays synchronous.

## Synchronization in compute work

- A kernel with `std.workgroupBarrier()` needs every thread of the workgroup to reach it: keep out-of-range threads running through the barrier, skipping their loads and stores and feeding an identity value, instead of returning early.
- Barriers don't synchronize separate workgroups. A phase that needs results from every workgroup is a separate dispatch; dispatches in one pass see each other's writes in order.
- Updates that read neighbours need separate input and output storage. For ping-pong over `n` steps, track which buffer holds the result (it depends on whether `n` is odd). Two bindings of the same buffer still alias.
- Keep GPU-produced counts on the GPU and feed them to indirect dispatch or draw (see `references/advanced.md`) instead of reading them back.

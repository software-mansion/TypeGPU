# GPU Timing (Timestamp Queries)

Docs: `https://docs.swmansion.com/TypeGPU/advanced/timestamp-queries.md`.

Timing requires the `timestamp-query` device feature (see `references/setup.md`): gate all timing code on `root.enabledFeatures.has('timestamp-query')` and no-op without it. Without the feature `withPerformanceCallback` logs a warning and skips timing, and `withTimestampWrites` throws. All timestamps are nanosecond `bigint`s.

**Timestamps are quantized by default in most environments** as a timing-attack mitigation ([WebGPU spec, device/queue timing](https://www.w3.org/TR/webgpu/#security-timing-device)). Chrome rounds them to 100 µs, so very fast pipelines read as 0 or noise. Full precision needs a per-browser opt-out. Chrome's `chrome://flags/#enable-webgpu-developer-features` is a bundle, not a timestamp-only switch: it also removes the timing-attack mitigation, exposes extended adapter information (driver, backend, memory heaps, a device-fingerprinting surface) and enables other non-standard developer features. Tell the user the full trade-off before recommending it; it is for local development only, never a production requirement.

## Quick timing: `withPerformanceCallback`

```ts
const pipeline = root
  .createComputePipeline({ compute: computeShader })
  .withPerformanceCallback((start, end) => {
    console.log(`took ${Number(end - start)} ns`);
  });
```

- Signature `(start: bigint, end: bigint) => void | Promise<void>`. Calling `.withPerformanceCallback()` again replaces the callback, so attach it once after pipeline creation.
- **Each pipeline with a callback allocates its own query set** (plus resolve buffers) unless `withTimestampWrites` supplies one, and resolves and reads back per submission: four timed pipelines mean four query sets and four readbacks. Use it to measure a pipeline or two temporarily; a durable setup (perf HUD, profiler across many passes) uses one shared query set (below).
- Works for direct `draw`/`dispatchWorkgroups` calls and for `pipeline.with(encoder)` on a `root.createCommandEncoder()` encoder (the callback fires after `encoder.submit()`). It is ignored, with a warning, when recording into a raw or wrapped `GPUCommandEncoder` or drawing into a shared pass: timestamp writes belong to the pass descriptor there, so pass `timestampWrites` to `encoder.beginRenderPass`/`beginComputePass`.
- Executions in one encoder share the pipeline's query indices, so every reading is the last execution. Reusing one bound wrapper (`const timed = pipeline.with(encoder)`) fires the callback once per submission (and warns); calling `pipeline.with(encoder)` again for each execution fires it once per call, with the same final timestamps.
- A submission whose readback would overlap a previous, still-pending one skips its callback; a read that fails (device lost or destroyed) is dropped silently.
- An error thrown inside the callback is logged with `console.error` and never reaches the caller; handle errors inside the callback.

Live readings of the same workload fluctuate noticeably between frames. Use them for orders of magnitude and trends. For a small A/B difference, compare many frames at a fixed load, or replay a GPU capture.

## Durable timing: one shared query set

Create one query set sized for all tracked passes and give each pass a begin/end index pair:

```ts
const querySet = root.createQuerySet('timestamp', 2 * PASS_COUNT);

// pass i writes to slots 2i / 2i+1:
const timedPipeline = pipeline.withTimestampWrites({
  querySet,
  beginningOfPassWriteIndex: 2 * i,
  endOfPassWriteIndex: 2 * i + 1,   // omit either index to skip that write
});
```

`withTimestampWrites` applies when the pipeline records its own pass (a direct `draw` / `dispatchWorkgroups`, or `pipeline.with(encoder)`); in a shared pass it is ignored with a warning. Pass descriptors take the same shape: `encoder.beginRenderPass({ ..., timestampWrites })` / `beginComputePass({ timestampWrites })` accept a `TgpuQuerySet` directly; a raw WebGPU encoder needs `root.unwrap(querySet)`.

Timestamp writes are near-free, so tracked passes can be timed on every dispatch. The readback (`resolve()` and `read()`, a buffer map) is the expensive part: sample at a low rate (a HUD refresh a few times per second), and one readback covers every tracked pass:

```ts
if (querySet.available) {        // false while a previous read is in flight
  querySet.resolve();
  const ts: bigint[] = await querySet.read();
  const passMs = Number(ts[2 * i + 1] - ts[2 * i]) / 1e6;
}
```

- **Check `querySet.available` before `resolve()`/`read()`.** `resolve()` throws and a second `read()` fails while a previous read is still in progress (CPU-side buffer mapping regularly outlives a GPU frame). Keep at most one read in flight.
- `read()` without a prior `resolve()` throws or returns stale data. `resolve()` submits its own command buffer, so submit the encoder that writes the slots first; resolving while a frame is still being recorded reads the previous values.
- A pass that didn't run since the last sample keeps its previous timestamps: track the last seen end value per slot and report 0 when it hasn't changed.

## Interpreting the numbers: passes overlap

GPUs run passes with no resource dependency between them concurrently, so per-pass durations double-count shared wall time: **the sum of per-pass times inside an encoder is usually more than the frame's GPU time**. Treat per-pass numbers as relative attribution, not budget shares. The frame's GPU wall time is the span from the earliest `begin` to the latest `end` across its slots, computed from the same readback.

## Occlusion queries

`root.createQuerySet('occlusion', n)` counts samples that pass the depth/stencil tests. Pass it as `occlusionQuerySet` to `encoder.beginRenderPass`, wrap draws in `pass.beginOcclusionQuery(i)` / `pass.endOcclusionQuery()`, then `resolve()` and `read()` as above (non-zero means visible). Occlusion queries need no device feature. `querySet.destroy()` releases either kind.

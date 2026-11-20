# GPU Timing (Timestamp Queries)

Docs: `https://docs.swmansion.com/TypeGPU/advanced/timestamp-queries.md`.

Requires the `timestamp-query` device feature (see `references/setup.md`) — gate all timing code on `root.enabledFeatures.has('timestamp-query')` and no-op without it. All timestamps are nanosecond `bigint`s.

**Timestamps are quantized by default in most environments** as a timing-attack mitigation ([WebGPU spec, device/queue timing](https://www.w3.org/TR/webgpu/#security-timing-device)) — Chrome rounds them to 100 µs, so very fast pipelines read as 0 or noise. Full precision requires opting out per browser; in Chrome that's `chrome://flags/#enable-webgpu-developer-features`, which is a bundle, not a timestamp-only switch: it also removes the timing-attack mitigation, exposes extended adapter information (driver, backend, memory heaps — a device-fingerprinting surface), and enables other non-standard developer features. Inform the user of that full trade-off before recommending it; it is for local development/testing only and can never be a production requirement.

## Quick timing: `withPerformanceCallback`

```ts
const pipeline = root
  .createComputePipeline({ compute: computeShader })
  .withPerformanceCallback((start, end) => {
    console.log(`took ${Number(end - start)} ns`);
  });
```

- Callback signature `(start: bigint, end: bigint) => void | Promise<void>`; calling `.withPerformanceCallback()` again replaces the previous callback — attach once after pipeline creation.
- **Each pipeline with a callback allocates its own query set** (plus resolve buffers), and resolves + reads back per submission. Four timed pipelines = four query sets and four readbacks. Fine for quick, temporary measurement of a pipeline or two; for a durable setup (perf HUD, profiler across many passes) use one shared query set instead (below).
- Works for direct `draw`/`dispatchWorkgroups` calls and for `pipeline.with(encoder)` on a `root.createCommandEncoder()` encoder (the callback fires after `encoder.submit()`). It is ignored, with a warning, when recording into a raw `GPUCommandEncoder` or drawing into a shared pass: timestamp writes belong to the pass descriptor there, so pass `timestampWrites` to `encoder.beginRenderPass`/`beginComputePass`.
- One encoder submission fires the callback once. Executing the same timed pipeline several times in one encoder reuses the same query indices, so it reports the last execution (and warns).
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

`withTimestampWrites` throws when the `timestamp-query` feature is missing. It applies when the pipeline records its own pass (a direct `draw` / `dispatchWorkgroups`, or `pipeline.with(encoder)`); in a shared pass it is ignored with a warning. Pass descriptors take the same shape: `encoder.beginRenderPass({ ..., timestampWrites })` / `beginComputePass({ timestampWrites })` accept a `TgpuQuerySet` directly; a raw WebGPU encoder needs `root.unwrap(querySet)`.

Timestamp *writes* are near-free, so tracked passes can be timed on every dispatch. The expensive part is the readback — `resolve()` + `read()` (a buffer map). Sample at a low rate (a HUD refresh a few times per second), and one readback covers every tracked pass:

```ts
if (querySet.available) {        // false while a previous read is in flight
  querySet.resolve();
  const ts: bigint[] = await querySet.read();
  const passMs = Number(ts[2 * i + 1] - ts[2 * i]) / 1e6;
}
```

- **Always check `querySet.available` before `resolve()`/`read()`** — `resolve()` throws and a second `read()` fails while a previous read is still in progress (CPU-side buffer mapping regularly outlives a GPU frame). Keep at most one read in flight.
- `read()` without a prior `resolve()` throws or returns stale data.
- A pass that didn't run since the last sample keeps its previous timestamps — track the last seen end value per slot and report 0 when it hasn't changed, rather than repeating the stale duration.

## Interpreting the numbers: passes overlap

GPUs run passes with no resource dependency between them concurrently. Per-pass durations therefore double-count shared wall time — **the sum of per-pass times inside an encoder is usually more than the actual GPU time for the frame**. Treat per-pass numbers as relative attribution, not as budget shares.

The true GPU wall time of a frame is the span from the earliest `begin` to the latest `end` across all of the frame's slots — compute that from the same readback when the total matters.

## Occlusion queries

`root.createQuerySet('occlusion', n)` counts samples that pass the depth/stencil tests. Pass it as `occlusionQuerySet` to `encoder.beginRenderPass`, wrap draws in `pass.beginOcclusionQuery(i)` / `pass.endOcclusionQuery()`, then `resolve()` and `read()` as above (non-zero means visible). Occlusion queries need no device feature. `querySet.destroy()` releases either kind.

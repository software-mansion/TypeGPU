# `@typegpu/noise` - Random Values, Distributions, and Perlin

Take all shader randomness and noise from this package: per-thread `randf` for random values, `perlin2d`/`perlin3d` for gradient noise. Docs: <https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-noise.md>.

```ts
import { randf, perlin2d, perlin3d } from '@typegpu/noise';
```

Calls inside TypeGPU functions link automatically. Raw WGSL can use them through `tgpu.resolve({ template, externals: { randf, perlin3d } })`; see `references/pipelines.md`.

## PRNG (`randf`)

`randf.sample()` returns a uniform `f32` in `[0, 1)`. The default generator is xoroshiro64\*\*; seeds are bitcast and hashed, so seed magnitude does not matter. Each thread has private generator state: **seed every thread from something thread-unique** (pixel position, global invocation id) once, before sampling. Unseeded threads all produce the same sequence.

```ts
const main = tgpu.fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(({ pos }) => {
  'use gpu';
  randf.seed2(pos.xy);
  return d.vec4f(randf.sample(), randf.sample(), 0, 1);
});
```

Compute kernels seed from the invocation id (`count` and `time` are uniforms, `particles` a mutable array):

```ts
const scatter = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x >= count.$) {
    return;
  }

  randf.seed2(d.vec2f(d.f32(gid.x), time.$));
  particles.$[gid.x].velocity = randf.inUnitCircle() * 0.1;
});
```

| Function | Seed type |
|---|---|
| `randf.seed(x)` | `f32` |
| `randf.seed2(v)` | `d.v2f` |
| `randf.seed3(v)` | `d.v3f` |
| `randf.seed4(v)` | `d.v4f` |

A seed made only of thread-unique values replays the same sequence every dispatch: right for static noise, wrong for animation. For per-frame variation, add a time or frame-count uniform as an extra component: `randf.seed3(d.vec3f(pos.xy, time.$))`.

## Distributions

All draw from the thread's `randf` state; no separate seeding.

| Function | Returns | Notes |
|---|---|---|
| `randf.sample()` | `f32` in `[0, 1)` | Base PRNG |
| `randf.sampleExclusive()` | `f32` in `(0, 1)` | Safe before `log` |
| `randf.bernoulli(p)` | `0` or `1` as `f32` | `p` in `[0, 1]` |
| `randf.normal(mu, sigma)` | `f32` ~ N(mu, sigma) | Box-Muller; `sigma > 0` |
| `randf.exponential(rate)` | `f32` >= 0 | `rate > 0` |
| `randf.cauchy(x0, gamma)` | `f32` | Heavy-tailed; `gamma > 0` |
| `randf.inUnitCircle()` | `d.v2f` | Inside the unit disc |
| `randf.onUnitCircle()` | `d.v2f` | On the unit circle |
| `randf.inUnitCube()` | `d.v3f` | Inside `[0, 1)³` |
| `randf.onUnitCube()` | `d.v3f` | On the surface of `[0, 1]³` |
| `randf.inUnitSphere()` | `d.v3f` | Inside the unit ball |
| `randf.onUnitSphere()` | `d.v3f` | Uniform direction |
| `randf.inHemisphere(normal)` | `d.v3f` | Inside the hemisphere around `normal` |
| `randf.onHemisphere(normal)` | `d.v3f` | Uniform direction in the hemisphere around `normal` |

Uniform hemisphere direction: `onHemisphere(normal)`. Uniform sphere direction: `onUnitSphere()`.

## Swapping the generator

`randomGeneratorSlot` holds the `StatefulGenerator` behind `randf`. Built-ins: `XOROSHIRO64STARSTAR` (`DefaultGenerator`), `LCG32`, `BPETER`. Bind one with `root.with(randomGeneratorSlot, LCG32)`. A custom generator is `{ seed?, seed2?, seed3?, seed4?, sample }`, with `sample` built from `randomGeneratorShell` and state in a `tgpu.privateVar`; the helpers `hash`, `rotl`, `u32To01F32` and `scrambleSeed{,2,3,4}` are exported for that.

## Perlin noise

`perlin2d.sample(p: v2f)` and `perlin3d.sample(p: v3f)` return smooth gradient noise in `[-1, 1]`, one lattice cell per unit. `perlin2d.sampleWithGradient(p)` returns `vec3f(value, dValue/dx, dValue/dy)`.

```ts
const main = tgpu.fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(({ pos }) => {
  'use gpu';
  const n = perlin2d.sample(pos.xy * 0.05);
  return d.vec4f(d.vec3f(n * 0.5 + 0.5), 1);
});
```

Uncached, `sample` recomputes lattice gradients per call. For many samples per thread (FBM, warping, derivatives), precompute gradients into a cache and inject it into the pipeline; shader code stays unchanged. The docs report up to 10x speedups.

### Static cache

Fixed domain size, chosen at creation:

```ts
const cache = perlin3d.staticCache({ root, size: d.vec3u(64, 64, 64) });

const pipeline = root.pipe(cache.inject()).createComputePipeline({ compute: main });
```

`root.pipe(cache.inject())` binds the cache's gradient lookup into the root's configuration, like the matching `.with(...)` calls. Sampling wraps at the domain boundary, so noise tiles with period `size`. 2D: `perlin2d.staticCache({ root, size: d.vec2u(...) })`. `cache.destroy()` frees the buffer.

### Dynamic cache

Domain size changes at runtime without recompiling:

```ts
const cacheConfig = perlin3d.dynamicCacheConfig();
const cacheLayout = tgpu.bindGroupLayout({ ...cacheConfig.layout });

const pipeline = root
  .pipe(cacheConfig.inject(cacheLayout.$))
  .createComputePipeline({ compute: main });

const cache = cacheConfig.instance(root, d.vec3u(10, 10, 1));

function cacheBindGroup(size: d.v3u) {
  cache.size = size;
  return root.createBindGroup(cacheLayout, cache.bindings);
}

let bindGroup = cacheBindGroup(d.vec3u(10, 10, 1));
// later, after a size change:
bindGroup = cacheBindGroup(d.vec3u(64, 64, 32));
```

Bind `bindGroup` with `pipeline.with(bindGroup)` when recording. Setting `cache.size` rebuilds the gradients the next time `cache.bindings` is read. `dynamicCacheConfig({ prefix })` renames the layout entries (default `perlin3dCache__`) to avoid key clashes when spreading them into a layout with other entries. Use `staticCache` when the size is known up front; the dynamic one adds a bind group and a size uniform read per lookup.

Small, one-off sampling (a few samples per fragment, no FBM) needs no cache.

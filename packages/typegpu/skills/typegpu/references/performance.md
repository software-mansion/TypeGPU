# Shader Performance

Measurements cited here are from Apple M4 Pro on Chrome (Dawn/Metal); ratios on other GPUs differ, the direction usually holds.

## Measure, then change

Judge a change by GPU time from a replayed capture or many frames at a fixed load; live timestamps are noisy (see `references/timing.md`). For ALU-bound kernels, time tracks the executed instruction count. Register count and occupancy did not predict time, so don't optimize for them.

## Leave to the compiler

These choices compiled to the same code or measured within noise, so write whichever reads best:
- declaration order of large values;
- struct copies, and field-by-field vs whole-struct writes;
- early-outs placed before *pure* loads (the compiler sinks the loads);
- hoisting `uniform.$.x` out of loops, and uniform vs storage for parameters;
- unused struct fields of an inlined value (dead-field elimination is automatic).

Only non-movable work (derivative sampling, atomics, writes) is worth moving behind a branch.

## Do by hand

- **Hoist loop-invariant algebra.** Rewrite the maths so invariant work leaves the loop, e.g. transform a ray once instead of every marched point (measured: 60% less time, and the smaller body then auto-unrolled).
- **Keep integer `%` and `std.intdiv` by runtime values out of hot loops.** Each costs several times a `sin`; `%` by a constant is about half of that. For unsigned values and a power-of-two `n`, write `x & (n - 1)` and `x >>> k` (where `n = 2 ** k`).

## Branches and divergence

- A runtime ternary or `std.select` evaluates both sides. With a uniform condition (a mode, a uniform flag), `if`/`else` skips the dead side; on a divergent condition the two cost the same.
- A divergent `break` saves nothing: the SIMD group runs as long as its slowest lane. Early exits pay off when neighbouring threads exit together.

## Loops and unrolling

- Metal unrolls loops of up to 8 iterations itself, so `tgpu.unroll` changes nothing there.
- Manually unrolling 12–128 iterations of a dependent chain (FBM octaves, fixed-step marches) was about 15% faster than the rolled loop.
- The limit is code size, not registers: past roughly 4–5k static instructions full unrolling loses. For long loops, unroll an inner chunk of 8 inside a rolled loop (at 512 iterations: 11% faster than rolled, 33% faster than fully unrolled):

```ts
for (const i of std.range(N / 8)) {
  for (const j of tgpu.unroll(std.range(8))) {
    acc = step(acc, d.f32(i * 8 + j));
  }
}
```

- Loops that index a small local array gain the most from unrolling: constant indices remove the array's stack loads.
- Keep a data-dependent `break` as a `break`; unrolled, guarded iterations measured slower.

## Memory layout

- **SoA vs AoS by access pattern.** SoA when kernels read a subset of fields (about 2x for one field), AoS when they read whole records.
- **Texture or storage buffer:**
  - Random access (gathers, lookup tables): a packed storage buffer (e.g. rgba8 in a `u32`, decoded with `std.unpack4x8unorm`) beats a texture, even with manual interpolation.
  - Coherent filtered reads (blurs, warps, primary-ray volume marching): use a texture; hardware filtering is nearly free there.
- **Format size.** Texture read cost grows about linearly with bytes per texel; use the smallest format that holds the data. For random `textureLoad` of `rgba32float`, an `array<vec4f>` storage buffer was 6x faster.

## Workgroups and precision

- Workgroup sizes 32–256 performed the same; 16 was 2.3x slower. Use 64 (or 64–256) for portability across vendors.
- `f16` cut time by 14–19% in the measured kernels; gains are GPU-dependent, so measure before converting a kernel.

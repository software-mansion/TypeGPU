# Compile-time specialization

`'use gpu'` code runs once more in JS while TypeGPU generates WGSL. Anything known at that moment (captured JS values, slots, argument types, fixed array lengths, schema sizes) can choose code paths and unroll loops at no runtime cost. Read this file when one function must serve several types or configurations, or a loop should be unrolled. Language rules are in `references/shaders.md`.

Docs: https://docs.swmansion.com/TypeGPU/apis/functions.md and https://docs.swmansion.com/TypeGPU/apis/utils.md

## Contents

- **Polymorphism and branch pruning** — one function, many WGSL variants; `.kind`, `std.typeOf`
- **`switch` on compile-time values**
- **`tgpu.unroll`** — supported iterables, numeric ranges, `std.isKnownAtComptime`
- **`tgpu.comptime`** — JS evaluated at compile time; schema utilities that fold to constants

## Polymorphism and branch pruning

TypeGPU generates one WGSL overload per unique call-site type combination (`number` and any union type). For union-typed parameters, `.kind` checks let you prune branches per type at compile time:

```ts
const area = (shape: d.v2f | d.v3f): number => {
  'use gpu';
  const base = shape.x * shape.y; // .x and .y are on both
  if (shape.kind === 'vec2f') {
    return base;                  // only in the vec2f overload
  } else {
    return base * shape.z;        // only in the vec3f overload
  }
};

area(d.vec2f(3, 4));    // fn area(shape: vec2f) -> f32 { let base = (shape.x * shape.y); return base; }
area(d.vec3f(3, 4, 5)); // fn area_1(shape: vec3f) -> f32 { ...; return (base * shape.z); }
```

Branch pruning also applies to compile-time-known captured values - `if` (and ternary) conditions resolvable at compile time, including inequality comparisons, keep only the winning branch in WGSL. This is how you write configurable shaders with no runtime overhead. `tgpu.const` values are the exception: they stay runtime constants and are never pruned on.

Pruning follows terminating control flow. When a compile-time-selected branch returns, statements after the `if` are emitted only for specializations where they remain reachable. This makes both an explicit `if`/`else` and an early-return form valid for comptime two-path splits.

`std.typeOf(x)` returns the schema `x` has in the generated shader (`d.f32`, `d.i32`, a struct schema), or `undefined` when it has none. Use it to specialize on types that `.kind` doesn't cover, such as scalars. Compare it immediately or pass it to a `tgpu.comptime` function; storing it in a variable throws, and calling it outside shader generation throws:

```ts
const twice = (v: number) => {
  'use gpu';
  if (std.typeOf(v) === d.f32) {
    return v * 2;
  }
  return v << 1;
};
// twice(1.5) -> fn twice(v: f32) -> f32 { return (v * 2f); }
// twice(d.i32(3)) -> fn twice_1(v: i32) -> i32 { return (v << 1u); }
```

> **Caution:** each unique type combination generates a new WGSL function. Calling the same polymorphic function with many signatures bloats output. Use `tgpu.fn` to pin the signature when polymorphism isn't needed.

---

## `switch` on compile-time values

When the selector and every case value are known at compile time, only the matching case (or `default`) is emitted, and the other cases are never resolved. Here the selector and case values may be any JS values, strings included, so a `switch` on `.kind` or on a string slot specializes like an `if` chain:

```ts
const shade = (v: d.v2f | d.v3f) => {
  'use gpu';
  switch (v.kind) {
    case 'vec2f':
      return v + d.vec2f(1, 0);
    case 'vec3f':
      return v + d.vec3f(1, 0, 0);
  }
};
```

A single `tgpu.const` case value, or any runtime value, turns it back into a full runtime `switch`.

---

## `tgpu.unroll`

Wrap the iterable of a `for...of` loop with `tgpu.unroll(...)` to inline every iteration as straight-line WGSL. Useful for small fixed counts where you want the compiler to see straight-line code.

```ts
for (const dy of tgpu.unroll([-1, 0, 1])) {
  for (const dx of tgpu.unroll([-1, 0, 1])) {
    processNeighbor(cell + d.vec2i(dx, dy));
  }
}
```

Hard rules: **no `continue` or `break` targeting the unrolled loop itself** (a nested runtime loop inside the body may use them), and the length must be known at compile time.

When unrolling pays, and how to unroll long loops in chunks: see `references/performance.md`.

### Unrolling a numeric range

`tgpu.unroll(std.range(...))` unrolls the range at compile time instead of generating a runtime loop:

```ts
const FBM_OCTAVES = 3;

for (const i of tgpu.unroll(std.range(FBM_OCTAVES))) {
  sum += noise3d(pos * (FREQ * LACUNARITY ** i)) * (AMP * PERSISTENCE ** i);
}
```

`i` is a comptime JS number per iteration, so `LACUNARITY ** i` folds into literals.

### Supported iterables

| Form | Example | Notes |
|---|---|---|
| Inline primitive array | `tgpu.unroll([1, 2, 3])` | Each element inlined as a literal |
| `std.range(n)` | `tgpu.unroll(std.range(N))` | Same category as primitive array |
| Inline array of complex values | `tgpu.unroll([b1, b2])` | Elements **must be stored in variables first** - fresh constructors inside the literal throw |
| Vector | `tgpu.unroll(d.vec3f(v))` | Iterates components: `v[0u]`, `v[1u]`, ... |
| Array of keys | `const keys = Object.keys(obj) as (keyof typeof obj)[]` or `['a', 'b'] as const`, declared outside the shader; `tgpu.unroll(keys)` | Iterate `obj[key]`; each access folded at compile time. Works on entry function inputs too (`input[key]`). An inline string array inside the shader is rejected |
| Iterable in a variable | `const arr = [1,2,3]; tgpu.unroll(arr)` | Indexed access into WGSL `array<...>` - still unrolled |
| Buffers / accessors / `const` / `comptime` | `tgpu.unroll(acc.$)` | Works whenever length is known at compile time |

Conditional unrolling: `for (const x of shouldUnroll ? tgpu.unroll(arr) : arr)` - the JS-side flag is statically resolved, only one form survives in WGSL. To unroll exactly when the length is fixed, use `std.isKnownAtComptime`, which is `true` for values known during shader generation (captured JS values, slots, fixed array lengths) and `false` for runtime values and `tgpu.const`:

```ts
// layout.$.points fixed-size: unrolled; runtime-sized: stays a loop
for (
  const p of std.isKnownAtComptime(layout.$.points.length)
    ? tgpu.unroll(layout.$.points)
    : layout.$.points
) {
  sum += p;
}
```

Its argument is never emitted, so an argument with side effects (a call to a `tgpu.fn`) throws.

---

## `tgpu.comptime`

Evaluates an expression at compile time and embeds the result as a WGSL constant. Useful for turning CPU-side constants (colours, config, LUTs) into typed GPU values without buffers.

```ts
const color = tgpu.comptime((hex: number) => {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return d.vec3f(r / 255, g / 255, b / 255);
});

const material = tgpu.fn([d.vec3f], d.vec3f)((diffuse) => {
  'use gpu';
  const albedo = color(0xff00ff); // evaluated at compile time -> vec3f(1, 0, 1)
  return albedo * diffuse;
});
```

The function passed to `tgpu.comptime` runs in JS - any JS APIs are fair game. Every argument must be known at compile time (literals, captured values, slots, other comptime results); a runtime argument throws. The return value is either embedded (numbers, booleans, vectors, matrices) or consumed at compile time, e.g. as an `if` condition, a `switch` selector, an index (`table()[2]`) or `.length`. Wrap a returned struct instance or array in its schema to store it: `const p = Params(makeParams())`. Comptime calls are not cached - each call is evaluated separately.

`d.sizeOf`, `d.alignmentOf`, `d.schemasEqualStructurally` and `d.schemasEqualNominally` also fold to constants inside `'use gpu'` code, so schema comparisons prune branches (see `references/types.md`).

Related: `tgpu.lazy(fn)` also runs JS at resolution time, but wraps a single deferred value (accessed via `.$`) instead of a callable - use it when a captured value isn't known at module-eval time.

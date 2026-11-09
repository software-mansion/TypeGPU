# TypeGPU Shader Authoring

Docs: https://docs.swmansion.com/TypeGPU/apis/functions.md and https://docs.swmansion.com/TypeGPU/apis/utils.md

## Contents

- **`tgpu.fn` vs plain callback** — when to pin a signature; WGSL-implemented bodies as an escape hatch
- **Polymorphism and branch pruning** — one function, many WGSL variants; `std.typeOf`
- **Syntax limitations inside `'use gpu'`** — unsupported TS features; ternaries; `&&` and `||`; `switch`
- **Arithmetic operators** — `+ - * / %` on vectors/matrices, `**`, `tsover`, infix fallbacks
- **Numeric literal gotcha** — when `1.0` degrades to `abstractInt`
- **Do not assign textures or samplers to variables** — use them directly
- **Iteration** — `for...of`, `std.range`, `tgpu.unroll` (numeric ranges, supported iterables, `std.isKnownAtComptime`)
- **Arrays inside shaders**
- **`tgpu.comptime`** — compile-time evaluation; schema utilities at compile time
- **Shader entrypoints** — `tgpu.computeFn`, `tgpu.vertexFn`, `tgpu.fragmentFn`, with the builtin lists
- **Outer-scope capture** — captured values are inlined as WGSL literals
- **`std` standard library** — pointer to the full listing
- **`console.log` in shaders**
- **GPU-scoped variables** — `workgroupVar`, `privateVar`, `const`
- **Values vs references** — the most common source of `ResolutionError`; `d.ref` pointers in plain callbacks
- **Idiomatic shader code** — vector ops, struct constructors

## `tgpu.fn` vs plain callback

| | Plain callback | `tgpu.fn` |
|---|---|---|
| Types | Inferred at call sites | Declared explicitly |
| Polymorphism | One function, many WGSL variants | One fixed signature |
| Overloads | Yes (union types, branch pruning) | No |
| Best for | Helper math, flexible utilities, user-facing APIs | Library code, pinned signatures, pointer parameters (`d.ptrFn`), WGSL-bodied functions |

```ts
// Plain callback - one function, separate WGSL overloads per call-site type combination:
const scale = (v: d.v2f | d.v3f, factor: number) => {
  'use gpu';
  return v * factor;
};

// tgpu.fn - always one WGSL function:
const scale2D = tgpu.fn([d.vec2f, d.f32], d.vec2f)((v, factor) => {
  'use gpu';
  return v * factor;
});
```

### WGSL-implemented functions (escape hatch — prefer TS bodies)

`tgpu.fn` also accepts a WGSL body as a template literal. **Write function bodies in TypeScript by default**; the WGSL form is only for edge cases — a WGSL builtin `std` doesn't expose, or dropping in existing WGSL verbatim. External TypeGPU objects referenced in the body are wired in with `.$uses({...})` (callable at most once per function):

```ts
const getGradient = tgpu.fn([d.f32], d.vec3f)`(t) {
  return mix(startColor, endColor, t);
}`.$uses({ startColor, endColor });
```

---

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

## Syntax limitations inside `'use gpu'`

| Unsupported | Alternative |
|---|---|
| Object/array spreading (`{...obj}`) | Build the result manually |
| Inline functions / arrow fns, object methods | Define outside and capture; GPU methods on objects are properties (`fn: (x) => { 'use gpu'; ... }`) |
| `==`, `!=` | `===`, `!==` |
| `??`, `??=`, `&&=`, `\|\|=`, `**=`, `in`, `instanceof`, `typeof x === '...'` | `if`/`std.select`; `x = x ** n`; `.kind` or `std.typeOf` for type checks |
| `<`, `>`, `!` on vectors | `std.lt`, `std.gt`, ..., `std.not` (componentwise, references/std.md) |
| Web APIs, `Math.round`, `Math.random` | `std` functions; `Math` constants and the `Math` functions listed in references/std.md work |
| `async`/`await`, generators, `try`/`catch`, `throw` | Not supported |
| `do...while`, `for...in`, labeled `break`/`continue` | `while`, `for`, `for...of`; a flag to exit outer loops |
| Template literals, regex literals | Pass pieces as separate `console.log` arguments |
| `let x;` without initializer | `let x = d.f32(0)` - type must be inferrable |
| Update as expression (`const a = i++`, `c ? a++ : b`), prefix `++i` | Postfix `i++` as its own statement |
| `var`; several declarators (`let a = 0, b = 1`) | One `let`/`const` per statement |
| Destructuring declarations (`const { pos } = p`) | `const pos = p.pos` (one level of object destructuring in parameters is fine) |
| Default or rest parameters | Pass every argument explicitly |
| Object literals without a target type (`return { a, b }` from a plain callback) | Wrap in the struct schema: `return Result({ a, b })` |
| `$uses()` called more than once | Merge into a single call |

### Ternaries

- **Comptime-known condition** (captured JS value, slot, `comptime` result - equality *and* inequality comparisons): the dead branch is pruned from WGSL entirely.
- **Runtime condition**: lowered to WGSL `select(falseVal, trueVal, cond)`. `select` evaluates **both** branches, so branches must be side-effect-free (no assignments, increments, effectful calls) and produce scalar or vector values - no structs, arrays, or matrices. Use `if`/`else` for anything heavier.
- `std.select(falseVal, trueVal, cond)` is the explicit equivalent: branches are limited to scalars/vectors, and both arguments always evaluate.

### `&&` and `||`

When the left-hand side is comptime-known (a slot, simple accessor, or captured external), the expression is evaluated at compile time - JS short-circuit semantics apply and the dead side is pruned from WGSL. Otherwise both operands must be booleans and the operators compile to WGSL's strictly-boolean `&&`/`||` - value-returning JS idioms like `maybeVec || fallback` don't work at runtime; use `std.select` or `if`.

### `switch`

Compiles to WGSL `switch`. Stacked empty cases merge (`case 0u, 1u`), and a missing `default` is added as an empty one.

```ts
switch (mode.$) {
  case 0:
  case 1:
    color = shadeFlat(p);
    break;
  case 2:
    color = shadeToon(p);
    break;
  default:
    color = d.vec3f(1, 0, 1);
}
```

- **Selector:** `i32` or `u32`. Other types are cast to `i32` with only a console warning: an `f32` selector is truncated, and `bool` becomes 0/1. Vectors are rejected.
- **Case values:** must be compile-time constants: literals, captured JS constants or `as const` objects, slots, accessors bound to constants, and `tgpu.const` values. They are converted to the selector type, again with only a warning (`case 1.5` becomes `1`).
- **Values that pass TypeGPU but fail WGSL compilation:**
  - duplicate case values (JS treats the second as dead code);
  - a negative case on a `u32` selector, which emits `-1u`.
- **No fallthrough:** each non-empty case except the last must end with a top-level `break`, `return` or `continue`. An `if` at the end of a case doesn't count, even when both branches `break` or `return`; end the case with an unconditional statement. A conditional `break` earlier in the case is fine.
- **Scope:** each case is its own scope, unlike JS. A declaration in one case isn't visible in the next.
- **Returning from every case:** a value-returning function that ends in a runtime `switch` needs an explicit `default` that returns. Otherwise the auto-added empty `default` gives "missing return at end of function".
- **Loops:** `continue` inside a switch continues the enclosing loop. Inside a `tgpu.unroll` body, any `break` in a switch is rejected ("Cannot unroll loop containing `break`"). Write those cases without `break`, or use `if`/`else`.

**Compile-time switch.** When the selector and every case value are known at compile time, only the matching case (or `default`) is emitted, and the other cases are never resolved. Here the selector and case values may be any JS values, strings included, so a `switch` on `.kind` or on a string slot specializes like an `if` chain:

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

## Arithmetic operators

`+ - * / %` on scalars and vectors, and `+ - *` on matrices (matrix × matrix, matrix × vector, vector × matrix, matrix × scalar), are the idiomatic TypeGPU style, used throughout this skill. Inside `'use gpu'` the shader generator always handles them; `tsover` makes the IDE/typechecker accept them, and its `'use tsover'` directive enables them in CPU code — set it up by default (see `references/setup.md`). Infix methods (`.add()`, `.mul()`) and `std` operator functions (`std.add`, `std.mul`, `std.mod`) are the fallback for projects that genuinely can't use `tsover`.

```ts
const a = d.vec3f(1, 2, 3);
const b = d.vec3f(4, 5, 6);
const sum  = a + b;         // vec3f(5, 7, 9)
const prod = a * 2;         // vec3f(2, 4, 6) - scalar broadcast
const dot  = std.dot(a, b); // 32
```

Division of two scalars is `f32`, even when both operands are integers; use `std.intdiv(a, b)` for integer scalar division. Integer vectors divide as integers (`vec2i / 2` is a `vec2i`). Details in `references/types.md`.

Bitwise and shift operators (`& | ^ ~ << >> >>>`) and their compound forms work on integer scalars and vectors; `>>>` requires a `u32` left-hand side (where it's the same as `>>`), and a bare literal on the left is rejected: `d.u32(0x32) >>> corner`. Unary minus on a `u32` (`-gid.x`) is a resolution error; convert first (`-d.i32(gid.x)`).

`**` follows JS semantics and returns a float: integer bases are converted to `f32`. With an exponent known at compile time it lowers to the cheapest correct form: `x ** 2` becomes `x * x`, `x ** 0` becomes `1`, `x ** 1` becomes `x`, and other integer exponents become `pow(abs(x), n)` (even) or `sign(x) * pow(abs(x), n)` (odd), so negative bases work. Non-integer or runtime exponents emit `pow(x, y)`. `std.pow` always emits WGSL `pow`, which is undefined for negative bases.

---

## Numeric literal gotcha

A literal's type comes from its value: `1.0` is the number `1`, so `let x = 1.0` and `let sum = 0` declare `i32`, and later float writes are converted to `i32`. Declare floats with `d.f32(1)` / `d.f32(0)` (a fractional part like `1.1` is safe). Details in `references/types.md`.

---

## Do not assign textures or samplers to variables - use them directly

```ts
const myTex = layout.$.sampledTex; // BAD
const color = std.textureSample(myTex, layout.$.sampler, uv);
```

```ts
const color = std.textureSample(layout.$.sampledTex, layout.$.sampler, uv); // GOOD
```

---

## Iteration

### `for...of`

Compiles to a WGSL loop. The loop variable must be `const`. The iterable is an array or vector that is stored somewhere: a local variable, a buffer or accessor (`items.$`), or a function argument (including arrays passed by value). Runtime-sized arrays loop to `arrayLength`. An inline array literal needs `tgpu.unroll`. Iterate a buffer array through `items.$` / `layout.$.items` directly: a `const` alias of it (`const items = layout.$.items`) is rejected as an iterable.

```ts
for (const item of items.$) {
  process(item);
}
```

Classic C-style loops also work, and are the tool for runtime bounds: `for (let i = d.u32(0); i < count; i++) { ... }` (`std.range` below is comptime-only).

### `std.range` - numeric ranges for loops

Generates a sequence of integers. Three forms:

```ts
std.range(end)                // [0, 1, ..., end-1]
std.range(start, end)         // [start, start+1, ..., end-1]
std.range(start, end, step)   // [start, start+step, ...] while < end
```

Used directly in `for...of`, compiles to a WGSL `for` loop:

```ts
for (const i of std.range(0, 8, 2)) {
  result += data.$[i];
}
// -> for (var i = 0u; i < 8u; i += 2u) { ... }  (i32 when any bound/step is negative)
```

Descending ranges work with negative step: `std.range(10, -10, -1)`.

### `tgpu.unroll` (compile-time loop unrolling)

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

#### Unrolling a numeric range

`tgpu.unroll(std.range(...))` unrolls the range at compile time instead of generating a runtime loop:

```ts
const FBM_OCTAVES = 3;

for (const i of tgpu.unroll(std.range(FBM_OCTAVES))) {
  sum += noise3d(pos * (FREQ * LACUNARITY ** i)) * (AMP * PERSISTENCE ** i);
}
```

`i` is a comptime JS number per iteration, so `LACUNARITY ** i` folds into literals.

#### Supported iterables

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

## Arrays inside shaders

Declare mutable fixed-size local arrays with `d.arrayOf(dtype, count)(initialData)`:

```ts
const accum = d.arrayOf(d.f32, N)();     // zero-initialized
const vecs  = d.arrayOf(d.vec2f, 3)([    // with initial values
  d.vec2f(1, 2), d.vec2f(3, 4), d.vec2f(5, 6)
]);
```

A plain array literal also works when its elements share a type: `[d.vec2f(1, 2), d.vec2f(3, 4)]` becomes `array<vec2f, 2>`, `[1, 0.5]` becomes `array<f32, 2>`. An empty `[]` has no type. `.length` of a fixed-size array folds to a constant; on a runtime-sized buffer array it emits `arrayLength`. Do not call `Array.from` or create arrow functions inside the shader body.

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

---

## Shader entrypoints

### `tgpu.computeFn`

```ts
tgpu.computeFn({
  workgroupSize: [64],
  in: {
    gid:  d.builtin.globalInvocationId,   // vec3u
    lid:  d.builtin.localInvocationId,    // vec3u
    wgid: d.builtin.workgroupId,          // vec3u
    lidx: d.builtin.localInvocationIndex, // u32
    nwg:  d.builtin.numWorkgroups,        // vec3u
    gidx: d.builtin.globalInvocationIndex, // u32 - flat global thread index
    wgidx: d.builtin.workgroupIndex,      // u32 - flat workgroup index
  },
})((input) => { 'use gpu'; });
```

Subgroup builtins (`subgroupInvocationId`, `subgroupSize`, `subgroupId`, `numSubgroups`) need the `subgroups` feature (see `references/std.md`).

### `tgpu.vertexFn`

```ts
tgpu.vertexFn({
  in: {
    position: d.vec3f,                    // from vertex layout attribs
    vid:      d.builtin.vertexIndex,      // u32 - NOT wired through attribs
    iid:      d.builtin.instanceIndex,    // u32
  },
  out: {
    position: d.builtin.position,         // vec4f, required
    fragUv:   d.vec2f,                    // inter-stage varying
    cellId:   d.interpolate('flat', d.u32), // integer varyings must be flat
  },
})((input) => { 'use gpu'; return { position: ..., fragUv: ..., cellId: ... }; });
```

Integer varyings (`u32`, `i32`, integer vectors) need `d.interpolate('flat', ...)` in a shell. Shell-less entry functions passed straight to `root.createRenderPipeline` get flat interpolation on integer varyings automatically. `d.builtin.clipDistances` is a further vertex output (needs the `clip-distances` feature).

### `tgpu.fragmentFn`

```ts
tgpu.fragmentFn({
  in: {
    fragUv:      d.vec2f,                 // must match vertex out (excluding position)
    frontFacing: d.builtin.frontFacing,   // bool
    sampleIndex: d.builtin.sampleIndex,   // u32
  },
  out: d.vec4f,        // single output
  // named outputs: { outColor: d.vec4f, outNormal: d.vec4f }
})((input) => { 'use gpu'; return d.vec4f(...); });
```

Other fragment builtins: `d.builtin.position` (input, framebuffer coordinates), `d.builtin.primitiveIndex` (input, needs the `primitive-index` feature), `d.builtin.sampleMask` (input or output), `d.builtin.fragDepth` (output, alongside named color outputs).

---

## Outer-scope capture

Values from JS scope are read when the shader is generated and inlined as WGSL literals, and `std` and `Math` calls on them are folded - feature for configuration, bug when you expect JS changes to affect the shader:

```ts
let threshold = 0.5;
const check = (x: number) => { 'use gpu'; return x > threshold; };
// compiles to `return (x > 0.5f);`
// Later: threshold = 0.8; - no effect on pipelines already created
```

Anything that changes at runtime must go through a buffer, uniform, slot, or accessor.

Captures aren't limited to plain identifiers - nested member access resolves too: `matrix.columns[0]`, `Math.sin`, `config.colors[2]`, and private class fields (`this.#field`) in class-owned functions.

---

## `std` standard library

`std` (`import { std } from 'typegpu'`) wraps WGSL built-in functions plus TypeGPU additions (environment and compile-time probes, `std.copy`, `std.bitcast`, comparison/boolean vector helpers, in-shader matrix builders). Full function listing: `references/std.md`. Texture sampling stage/uniformity rules: `references/textures.md`.

---

## `console.log` in shaders

Supported in fragment and compute; in a vertex shader the call is dropped with a warning. Injects atomics for thread-safe output - **significant overhead**, debug only. `console.info`, `warn`, `error`, `debug` and `clear` work too. Arguments are string literals, scalars, vectors, matrices, structs and fixed-size arrays; each call may serialize at most 252 bytes, and at most 64 logs print per draw/dispatch, or per submission when they share a command encoder (raise with `tgpu.init({ unstable_logOptions: { logSizeLimit, logCountLimit } })`).

```ts
const debugCompute = tgpu.computeFn({ workgroupSize: [1] })(() => {
  'use gpu';
  console.log('thread reached here', someValue);
});
```

---

## GPU-scoped variables

Declared at module scope; persistent for the shader's lifetime.

```ts
// Shared across all threads in a workgroup (compute only):
const sharedAccum = tgpu.workgroupVar(d.arrayOf(d.f32, 64));

// Thread-private — each thread gets its own copy; optional initial value:
const threadState = tgpu.privateVar(d.vec3f, d.vec3f(1, 0, 0));

// Module-scope WGSL `const`, referenced by name (not inlined, not pruned on):
const PI_OVER_2 = tgpu.const(d.f32, Math.PI / 2);
const OFFSETS = tgpu.const(d.arrayOf(d.vec2i), [d.vec2i(-1, 0), d.vec2i(1, 0)]); // length from the value
```

Access via `sharedAccum.$`, `threadState.$`, `PI_OVER_2.$`. Workgroup vars start zeroed and require a barrier (`std.workgroupBarrier()`) before reading results written by other threads. `tgpu.const` values are read-only in shaders.

---

## Values vs references in `'use gpu'` code

**The single most common source of `ResolutionError` in hand-written shaders.**

**Mental model.** Scalars (`d.f32`, `number`, `boolean`) behave as values. Composites (vectors, matrices, structs, arrays) behave as **references** — a variable holding a `d.vec3f` is a handle to a memory location, not a bag of numbers. Reading is free; writing a component (`v.x = 1`) mutates the location.

**The extra rule.** A reference can be aliased with `const`, or copied with its schema constructor, but it cannot bind to `let` or be assigned with `=`. TypeGPU forces the ambiguity ("rebind or mutate through?") to be resolved at the binding site:

```ts
const startPoint = d.vec2f(1, 2);

let endPoint = startPoint;           // BAD: "references cannot be assigned"
let endPoint = d.vec2f(startPoint);  // OK: copy - fresh, independent, reassignable
const endPoint = startPoint;         // OK: alias - same memory, not reassignable
```

Same rule for reassignment, and for returning a parameter, a buffer/variable value or a field of one (returning a local is fine):

```ts
outColor = d.vec3f(spriteRgb);   // OK - not: outColor = spriteRgb
return d.vec3f(baseColor);       // OK when baseColor is a parameter
return Particle(particles.$[i]); // not: return particles.$[i]
```

**Expression results are ephemeral and safe.** Constructor calls, arithmetic, function returns, and literals aren't named storage, so `let`/`const`/assignment/arguments/returns all work:

```ts
let p = d.vec2f(0);                 // constructor result
p = input.uv * 2 + d.vec2f(1, 0);  // expression result
let q = computeOffset();            // function return
```

The "must copy" rule only kicks in when the right-hand side is itself a named reference (local variable, struct field, array element, function parameter). **Fix:** wrap in the schema constructor (`d.vec2f(v)`, `d.mat4x4f(m)`, `MyStruct(other)`), or swap `let` for `const` if you don't need to reassign. When the schema is generic, `std.copy(v)` copies.

Parameters are passed by value: writing to a parameter (`v.x = 1`, `v.xy = ...`) is rejected. To let a helper mutate the caller's value, pass a pointer.

### Pointers in plain callbacks: `d.ref`

`d.ref<T>` types a pointer parameter; `.$` reads and writes through it. It compiles to a `ptr<function, T>` (or the matching address space):

```ts
const Particle = d.struct({ pos: d.vec2f, life: d.f32 });

const bump = (counter: d.ref<number>) => {
  'use gpu';
  counter.$ += 1;
};

const age = (p: d.ref<d.Infer<typeof Particle>>) => {
  'use gpu';
  p.$.life -= 0.1;
};

const main = () => {
  'use gpu';
  const hits = d.ref(0);    // new referencable value: emits `var hits = 0;`
  bump(hits);
  const p = Particle({ pos: d.vec2f(), life: 1 });
  age(d.ref(p));            // pointer to an existing value: inline it in the call
  return hits.$;
};
```

- Store `d.ref(...)` of a fresh value (literal, constructor) in a `const` and pass that; `let` is rejected.
- Take `d.ref(existing)` of an existing composite inline at the call site; storing it in a variable is rejected.
- Scalars can't be referenced in place (`d.ref(count)`, `d.ref(p.life)` throw). Hold a mutable scalar as `const count = d.ref(0)` from the start.
- A `d.ref` from the outer scope is rejected; create it inside the function.
- A `d.ref` can't be returned. `d.ref(param)` and `d.ref(someConst.$)` throw; copy into a local first.

`tgpu.fn` signatures use pointer schemas instead (`d.ptrFn(d.f32)`, see `references/types.md`); pass them a `const x = d.ref(...)` or `d.ref(existing)` the same way.

---

## Idiomatic shader code

**Prefer vector operations over component decomposition.** With `tsover`, `+ - * / %` work on vectors and matrices directly, and scalar broadcast applies to all four arithmetic operators:

```ts
// GOOD - clean vector math:
let uv = input.uv * d.vec2f(0.3, 0.2) + 0.5;
let offset = direction * speed;
let color = baseColor * intensity + ambient;

// BAD - unnecessary decomposition:
let uvX = input.uv.x * 0.3 + 0.5;
let uvY = input.uv.y * 0.2 + 0.5;
let uv = d.vec2f(uvX, uvY);
```

**Struct constructors work inside shaders** — build the whole struct locally and assign once rather than mutating fields one by one on a storage buffer. This is about clarity: compilers usually generate the same memory traffic for both forms.

```ts
const Particle = d.struct({ pos: d.vec2f, vel: d.vec2f, life: d.f32 });

// GOOD - one readable update:
const oldP = particles.$[idx];
particles.$[idx] = Particle({
  pos: oldP.pos + oldP.vel * dt,
  vel: oldP.vel * 0.99,
  life: oldP.life - dt,
});

// BAD - repeated indexing, harder to read:
particles.$[idx].pos = particles.$[idx].pos + particles.$[idx].vel * dt;
particles.$[idx].vel.x = particles.$[idx].vel.x * 0.99;
particles.$[idx].life = particles.$[idx].life - dt;
```

Struct constructor forms: `MyStruct()` (zero-init), `MyStruct({ field: value, ... })` (named fields), `MyStruct(otherInstance)` (copy).

**Write vector parts through swizzles** (`color.rgb *= 0.5`, `v.xz = d.vec2f(0)`) instead of rebuilding the vector; see `references/types.md`.

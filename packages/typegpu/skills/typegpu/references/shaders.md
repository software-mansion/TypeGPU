# TypeGPU Shader Authoring

Docs: https://docs.swmansion.com/TypeGPU/apis/functions.md and https://docs.swmansion.com/TypeGPU/apis/utils.md

## Contents

- **`tgpu.fn` vs plain callback** — when to pin a signature; WGSL-bodied functions
- **Syntax limitations inside `'use gpu'`** — unsupported TS features; ternaries; `&&` and `||`; `switch`
- **Arithmetic operators** — vectors and matrices, division, bitwise, `**`
- **Textures and samplers**
- **Iteration** — `for...of`, `std.range`
- **Arrays inside shaders**
- **Shader entrypoints** — `tgpu.computeFn`, `tgpu.vertexFn`, `tgpu.fragmentFn`, with the builtin lists
- **Outer-scope capture** — captured values are inlined as WGSL literals
- **`console.log` in shaders**
- **GPU-scoped variables** — `workgroupVar`, `privateVar`, `const`
- **Values vs references** — `references cannot be assigned`; `d.ref` pointers in plain callbacks
- **Idiomatic shader code** — vector ops, struct constructors

Compile-time specialization (polymorphism, `std.typeOf`, compile-time `switch`, `tgpu.unroll`, `tgpu.comptime`) is in `references/compile-time.md`; the full `std` listing is in `references/std.md`.

## `tgpu.fn` vs plain callback

| | Plain callback | `tgpu.fn` |
|---|---|---|
| Types | Inferred at call sites | Declared explicitly |
| Polymorphism | One WGSL overload per call-site type combination; `.kind` / `std.typeOf` branches prune per type | One fixed signature |
| Best for | Helper math, flexible utilities, user-facing APIs | Library code, pinned signatures, pointer parameters (`d.ptrFn`), WGSL-bodied functions |

```ts
// Plain callback: a separate WGSL overload for vec2f and vec3f callers
const scale = (v: d.v2f | d.v3f, factor: number) => {
  'use gpu';
  return v * factor;
};

const scale2D = tgpu.fn([d.vec2f, d.f32], d.vec2f)((v, factor) => {
  'use gpu';
  return v * factor;
});
```

### WGSL-implemented functions

`tgpu.fn` also accepts a WGSL body as a template literal, for a WGSL builtin `std` doesn't expose or existing WGSL used verbatim; write TypeScript bodies otherwise. Wire in referenced TypeGPU objects with `.$uses({...})`, called at most once per function:

```ts
const getGradient = tgpu.fn([d.f32], d.vec3f)`(t) {
  return mix(startColor, endColor, t);
}`.$uses({ startColor, endColor });
```

---

## Syntax limitations inside `'use gpu'`

| Unsupported | Alternative |
|---|---|
| Object/array spreading (`{...obj}`) | Build the result manually |
| Inline functions / arrow fns, object methods | Define outside and capture; GPU methods on objects are properties (`fn: (x) => { 'use gpu'; ... }`) |
| `==`, `!=` | `===`, `!==` |
| `??`, `??=`, `&&=`, `\|\|=`, `**=`, `in`, `instanceof`, `typeof x === '...'` | `if`/`std.select`; `x = x ** n`; `.kind` or `std.typeOf` for type checks |
| `<`, `>`, `!` on vectors | `std.lt`, `std.gt`, ..., `std.not` (componentwise, references/std.md) |
| Web APIs, `Math.round`, `Math.random`, `Array.from` | `std` functions; `Math` constants and the `Math` functions listed in references/std.md work |
| `async`/`await`, generators, `try`/`catch`, `throw` | Not supported |
| `do...while`, `for...in`, labeled `break`/`continue` | `while`, `for`, `for...of`; a flag to exit outer loops |
| Template literals, regex literals | Pass pieces as separate `console.log` arguments |
| `let x;` without initializer | `let x = d.f32(0)` - type must be inferrable |
| Update as expression (`const a = i++`, `c ? a++ : b`), prefix `++i` | Postfix `i++` as its own statement |
| `var`; several declarators (`let a = 0, b = 1`) | One `let`/`const` per statement |
| Destructuring declarations (`const { pos } = p`) | `const pos = p.pos` (one level of object destructuring in parameters is fine) |
| Default or rest parameters | Pass every argument explicitly |
| Object literals without a target type (`return { a, b }` from a plain callback) | Wrap in the struct schema: `return Result({ a, b })` |

### Ternaries

- A comptime-known condition (captured JS value, slot, `comptime` result; equality and inequality comparisons) prunes the dead branch from WGSL.
- A runtime condition lowers to `select(falseVal, trueVal, cond)`, as does an explicit `std.select`. Both branches evaluate, so they must be side-effect-free (no assignments, increments, effectful calls) scalars or vectors, not structs, arrays or matrices. Use `if`/`else` for anything heavier.

### `&&` and `||`

With a comptime-known left-hand side (a slot, simple accessor, or captured external), JS short-circuit semantics apply at compile time and the dead side is pruned. Otherwise both operands must be booleans and compile to WGSL's strictly-boolean `&&`/`||`, so `maybeVec || fallback` fails at runtime; use `std.select` or `if`.

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
- **Duplicate case values** pass TypeGPU (JS treats the second as dead code) but fail WGSL compilation.
- **A negative case on a `u32` selector** wraps with a warning: `case -1` emits `case 4294967295u`.
- **No fallthrough:** each non-empty case except the last must end with a top-level `break`, `return` or `continue`. An `if` at the end of a case doesn't count, even when both branches `break` or `return`; end the case with an unconditional statement. A conditional `break` earlier in the case is fine.
- **Scope:** each case is its own scope, unlike JS. A declaration in one case isn't visible in the next.
- **Returning from every case:** a value-returning function that ends in a runtime `switch` needs an explicit `default` that returns. Otherwise the auto-added empty `default` gives "missing return at end of function".
- **Loops:** `continue` inside a switch continues the enclosing loop. Inside a `tgpu.unroll` body, any `break` in a switch is rejected ("Cannot unroll loop containing `break`"). Write those cases without `break`, or use `if`/`else`.

A selector and case values known at compile time keep only the matching case: see `references/compile-time.md`.

---

## Arithmetic operators

`+ - * / %` work on scalars and vectors, with scalar broadcast. Matrices take `+` and `-` with another matrix of the same type, and `*` for matrix × matrix, matrix × vector, vector × matrix and matrix × scalar. The shader generator always handles them inside `'use gpu'`; `tsover` makes the type checker accept them and its `'use tsover'` directive enables them in CPU code, so set it up by default (`references/setup.md`). Infix methods (`.add()`, `.mul()`) and `std.add` / `std.mul` / `std.mod` are the fallback for projects that can't use `tsover`.

Scalar `/` is floating-point division; divide integer scalars with `std.intdiv(a, b)`. Integer vectors divide as integers. Details in `references/types.md`.

Bitwise and shift operators (`& | ^ ~ << >> >>>`) and their compound forms work on integer scalars and vectors; `>>>` requires a `u32` left-hand side (where it's the same as `>>`), and a bare literal on the left is rejected: `d.u32(0x32) >>> corner`. Unary minus on a `u32` (`-gid.x`) is a resolution error; convert first (`-d.i32(gid.x)`).

`**` follows JS semantics and returns a float: integer bases are converted to `f32`. With an exponent known at compile time it lowers to the cheapest correct form: `x ** 2` becomes `x * x`, `x ** 0` becomes `1`, `x ** 1` becomes `x`, and other integer exponents become `pow(abs(x), n)` (even) or `sign(x) * pow(abs(x), n)` (odd), so negative bases work. Non-integer or runtime exponents emit `pow(x, y)`. `std.pow` always emits WGSL `pow`, which is undefined for negative bases.

A whole-number literal declares an integer (`let sum = 0` and `let x = 1.0` are `i32`); declare floats with `d.f32(0)`. Details in `references/types.md`.

---

## Textures and samplers

Pass them straight into the call, `std.textureSample(layout.$.sampledTex, layout.$.sampler, uv)`, or give them a local name with `const`:

```ts
const tex = layout.$.sampledTex;
const smp = layout.$.sampler;
return std.textureSample(tex, smp, uv); // emits textureSample(sampledTex, sampler, uv)
```

A `const` holding a texture or sampler (laid-out, fixed like `sampler.$` / `view.$`, or a handle parameter) is a compile-time alias: no WGSL declaration is emitted and every use resolves to the original handle. `let` is rejected, since handles can't be reassigned. Destructuring (`const { sampledTex } = layout.$`) isn't supported. Stage and uniformity rules for sampling: `references/textures.md`.

---

## Iteration

### `for...of`

Compiles to a WGSL loop. The loop variable must be `const`. The iterable is an array or vector that is stored somewhere: a local variable, a buffer or accessor (`items.$`), or a function argument (including arrays passed by value). Runtime-sized arrays loop to `arrayLength`. An inline array literal needs `tgpu.unroll`. Iterate a buffer array through `items.$` / `layout.$.items` directly: a `const` alias of it (`const items = layout.$.items`) is rejected as an iterable.

C-style loops are the tool for runtime bounds: `for (let i = d.u32(0); i < count; i++) { ... }` (`std.range` bounds are comptime-only).

### `std.range`

```ts
std.range(end)                // [0, 1, ..., end-1]
std.range(start, end)         // [start, start+1, ..., end-1]
std.range(start, end, step)   // [start, start+step, ...] while < end

for (const i of std.range(0, 8, 2)) {
  result += data.$[i];
}
// -> for (var i = 0u; i < 8u; i += 2u) { ... }  (i32 when any bound/step is negative)
```

Descending ranges take a negative step: `std.range(10, -10, -1)`.

### `tgpu.unroll`

Wrap a `for...of` iterable in `tgpu.unroll(...)` to emit every iteration as straight-line WGSL. Rules and supported iterables: `references/compile-time.md`.

---

## Arrays inside shaders

Declare mutable fixed-size local arrays with `d.arrayOf(dtype, count)(initialData)`:

```ts
const accum = d.arrayOf(d.f32, N)();     // zero-initialized
const vecs  = d.arrayOf(d.vec2f, 3)([d.vec2f(1, 2), d.vec2f(3, 4), d.vec2f(5, 6)]);
```

A plain array literal also works when its elements share a type: `[d.vec2f(1, 2), d.vec2f(3, 4)]` becomes `array<vec2f, 2>`, `[1, 0.5]` becomes `array<f32, 2>`. An empty `[]` has no type. `.length` of a fixed-size array folds to a constant; on a runtime-sized buffer array it emits `arrayLength`.

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

`globalInvocationIndex` and `workgroupIndex` need the `linear_indexing` WGSL language feature (`navigator.gpu.wgslLanguageFeatures.has('linear_indexing')`). For a 1D dispatch, `gid.x` works everywhere.

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
    cellId:   d.interpolate('flat', d.u32),
  },
})((input) => { 'use gpu'; return { position: ..., fragUv: ..., cellId: ... }; });
```

Integer varyings (`u32`, `i32`, integer vectors) need `d.interpolate('flat', ...)` in a shell. Shell-less entry functions passed straight to `root.createRenderPipeline` get flat interpolation on integer varyings automatically. `d.builtin.clipDistances` is a further vertex output, an `array<f32, 8>` (needs the `clip-distances` feature).

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

Values from JS scope are read when the shader is generated and inlined as WGSL literals, and `std` and `Math` calls on them are folded. Later JS changes don't reach pipelines already created:

```ts
let threshold = 0.5;
const check = (x: number) => { 'use gpu'; return x > threshold; };
// compiles to `return (x > 0.5f);`
```

Anything that changes at runtime goes through a buffer, uniform, slot, or accessor.

Nested member access resolves too: `matrix.columns[0]`, `Math.sin`, `config.colors[2]`, and private class fields (`this.#field`) in class-owned functions.

---

## `console.log` in shaders

Supported in fragment and compute; in a vertex shader the call is dropped with a warning. It injects atomics for thread-safe output, a significant overhead, so use it only to debug. `console.info`, `warn`, `error`, `debug` and `clear` work too. Arguments are string literals, scalars, vectors, matrices, structs and fixed-size arrays; each call may serialize at most 252 bytes, and at most 64 logs print per draw/dispatch, or per submission when they share a command encoder (raise with `tgpu.init({ unstable_logOptions: { logSizeLimit, logCountLimit } })`).

---

## GPU-scoped variables

Declared at module scope:

```ts
// Shared across all threads in a workgroup (compute only):
const sharedAccum = tgpu.workgroupVar(d.arrayOf(d.f32, 64));

// Thread-private, optional initial value:
const threadState = tgpu.privateVar(d.vec3f, d.vec3f(1, 0, 0));

// Module-scope WGSL `const`, referenced by name (not inlined, not pruned on):
const PI_OVER_2 = tgpu.const(d.f32, Math.PI / 2);
const OFFSETS = tgpu.const(d.arrayOf(d.vec2i), [d.vec2i(-1, 0), d.vec2i(1, 0)]); // length from the value
```

Access via `sharedAccum.$`, `threadState.$`, `PI_OVER_2.$`. Workgroup vars start zeroed and need `std.workgroupBarrier()` before reading values written by other threads. `tgpu.const` values are read-only in shaders.

---

## Values vs references in `'use gpu'` code

Scalars (`d.f32`, `number`, `boolean`) are values. Vectors, matrices, structs and arrays are references: a variable holding a `d.vec3f` is a handle to a memory location, and writing a component (`v.x = 1`) mutates that location.

A named reference (local variable, struct field, array element, function parameter) can be aliased with `const` or copied with its schema constructor, but it can't bind to `let` or be assigned with `=`. The same holds for returning a parameter, a buffer or variable value, or a field of one; returning a local is fine:

```ts
let endPoint = startPoint;           // "references cannot be assigned"
let endPoint = d.vec2f(startPoint);  // copy: independent, reassignable
const endPoint = startPoint;         // alias: same memory

outColor = d.vec3f(spriteRgb);       // not: outColor = spriteRgb
return d.vec3f(baseColor);           // when baseColor is a parameter
return Particle(particles.$[i]);     // not: return particles.$[i]
```

Expression results (constructor calls, arithmetic, function returns, literals) aren't named storage, so `let`, assignment, arguments and returns all take them: `p = input.uv * 2 + d.vec2f(1, 0)`. Copy with the schema (`d.vec2f(v)`, `d.mat4x4f(m)`, `MyStruct(other)`), or `std.copy(v)` when the schema is generic.

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

Write whole-vector operations instead of per-component arithmetic:

```ts
let uv = input.uv * d.vec2f(0.3, 0.2) + 0.5;
// not: d.vec2f(input.uv.x * 0.3 + 0.5, input.uv.y * 0.2 + 0.5)
```

Build a struct locally and assign it once instead of updating a buffer element field by field:

```ts
const oldP = particles.$[idx];
particles.$[idx] = Particle({
  pos: oldP.pos + oldP.vel * dt,
  vel: oldP.vel * 0.99,
  life: oldP.life - dt,
});
```

Struct constructor forms: `MyStruct()` (zero-init), `MyStruct({ field: value, ... })` (named fields), `MyStruct(otherInstance)` (copy).

Write vector parts through swizzles (`color.rgb *= 0.5`, `v.xz = d.vec2f(0)`) instead of rebuilding the vector; see `references/types.md`.

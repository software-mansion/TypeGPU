# Matrices, `wgpu-matrix`, Cameras, and Fast CPU Writes

These three topics almost always show up together: `wgpu-matrix` as the math library, camera uniforms as the canonical use case, and fast CPU-side writes to avoid per-frame allocations. Read the whole file if your code involves view/projection matrices, particle systems, animated transforms, or per-frame uniform updates.

---

## `wgpu-matrix` integration

TypeGPU vectors and matrices are indexable (`mat[0]`, `vec.x` / `vec[0]`) exactly the way `wgpu-matrix` expects. Any TypeGPU primitive can be passed as a source **or as the `dst` argument** - the key to avoiding throwaway `Float32Array` allocations.

```ts
import { d } from 'typegpu';
import { mat4, vec3 } from 'wgpu-matrix';

// Bad - allocates a fresh Float32Array each call:
const view = mat4.lookAt(eye, target, up);

// Good - writes into a TypeGPU matrix you control:
const viewM = d.mat4x4f();
mat4.lookAt(eye, target, up, viewM);

// In-place chain (no allocations):
mat4.identity(viewM);
mat4.translate(viewM, [tx, ty, tz], viewM);
mat4.rotateY(viewM, yaw, viewM);
```

Same for vectors:

```ts
const dir = d.vec3f();
vec3.subtract(target, eye, dir); // writes into `dir`
vec3.normalize(dir, dir);        // in-place
```

> Requires `wgpu-matrix >= 3.3.0`.

For building matrices *inside shaders* (no CPU round-trip), `std` has `identity2/3/4`, `translation4`, `scaling4`, `rotationX4/Y4/Z4`, `transpose`, `determinant` — see `references/std.md`.

Without `dst`, `wgpu-matrix` allocates a new `Float32Array` per call. In a render loop doing 3-6 matrix ops per frame, that's 200+ allocations/sec - enough for GC stutters, just like per-frame `createView`/`createBindGroup`. Allocate once at setup, reuse forever.

---

## Matrix storage is column-major

WGSL matrices are column-major in memory. Key implications:

- **Constructor order.** `d.mat4x4f(c0, c1, c2, c3)` takes four columns. If you expected row-major (numpy/HLSL), you'll get a transpose.
- **`mat * vec` is column x column.** `M * v` applies `M`'s transform. Composition: `projection * view * model * position`.
- **Shader element access.** `mat[i]` is not allowed - use `mat.columns[i]` for the i-th column, `mat.columns[c][r]` for an element. (Flat `mat[i]` works only on CPU-side instances, which is what makes wgpu-matrix interop possible - not inside `'use gpu'`.)
- **`Float32Array` layouts** (raw byte writes):

  | Schema | Floats | Layout |
  |---|---|---|
  | `d.mat2x2f` | 4 | `[c0.x, c0.y, c1.x, c1.y]` - packed |
  | `d.mat3x3f` | **12** (not 9) | Each column padded to 4 floats: `[c0.x, c0.y, c0.z, PAD, c1..., c2...]` |
  | `d.mat4x4f` | 16 | `[c0.xyzw, c1.xyzw, c2.xyzw, c3.xyzw]` - packed |

  `mat3x3f`'s per-column padding to 16 bytes is a WGSL rule. Plain JS arrays (9 numbers) get padding added automatically; `TypedArray`/`ArrayBuffer` inputs must include it. `wgpu-matrix` follows all these conventions natively.

---

## Camera uniforms

A `d.struct` with `view`, `proj` (and optionally their inverses) updated via `.patch()`. Pre-allocate CPU-side scratch buffers (`Float32Array` or `d.mat4x4f`) and pass them as `dst` to `wgpu-matrix` to avoid per-frame allocations.

```ts
const Camera = d.struct({
  view: d.mat4x4f,
  proj: d.mat4x4f,
});

const viewMat = new Float32Array(16);
const projMat = new Float32Array(16);

mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, projMat);
mat4.lookAt(eye, target, up, viewMat);

const cameraUniform = root.createUniform(Camera, { view: viewMat, proj: projMat });

// Per-frame: recompute into the same buffer, write only what changed
mat4.lookAt(newEye, target, up, viewMat);
cameraUniform.patch({ view: viewMat });
```

Add `viewInv`/`projInv` fields when shaders need to go from clip/screen back to world space (ray marching, screen-space effects). Computing inverses once on the CPU beats per-fragment `mat4.inverse`.

---

## CPU-side data: avoid per-frame TypeGPU allocations

`d.vec3f(...)` and `d.mat4x4f(...)` allocate JS objects with indexed accessors, getters, method bindings, etc. In hot paths (render loops, particle systems, per-instance transforms) this means GC pressure and stutters - same class of mistake as per-frame `createView`/`createBindGroup`.

**Write-path speed (slowest to fastest):**

| Form | Example (`arrayOf(vec3f, N)`) | When to prefer |
|---|---|---|
| TypeGPU instances | `particles.map(p => d.vec3f(p.x, p.y, p.z))` | Small ad-hoc writes, teaching code |
| Plain tuples / arrays | `[[x, y, z], [x, y, z], ...]` | Readable, no wrapper allocation |
| Pre-allocated `Float32Array` | `f32.subarray(i*4, i*4+3).set([x, y, z])` | Hot paths; matches WGSL layout directly |
| Raw `ArrayBuffer` | `new Float32Array(arrayBuffer)[i*4] = x; ...` | Maximum throughput |

### Pre-allocated `Float32Array` + subarrays

The cleanest fast path for struct-heavy uniforms:

```ts
const Camera = d.struct({
  view: d.mat4x4f, proj: d.mat4x4f,
  viewInv: d.mat4x4f, projInv: d.mat4x4f,
});

const cameraBuffer = root.createBuffer(Camera).$usage('uniform');

// Single flat buffer, one view per matrix. Allocated ONCE.
const raw     = new Float32Array(d.sizeOf(Camera) / 4); // 64 floats
const view    = raw.subarray(0,  16);
const proj    = raw.subarray(16, 32);
const viewInv = raw.subarray(32, 48);
const projInv = raw.subarray(48, 64);

// Every frame - zero allocations:
function updateCamera(eye: Float32Array, target: Float32Array, up: Float32Array, aspect: number) {
  mat4.lookAt(eye, target, up, view);
  mat4.invert(view, viewInv);
  mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, proj);
  mat4.invert(proj, projInv);
  cameraBuffer.write(raw.buffer); // bytes straight through - no serialization
}
```

For struct schemas, `.write()` accepts a record or an `ArrayBuffer` - pass `raw.buffer`, not the `Float32Array` view (vector/matrix/array schemas accept TypedArrays directly).

Layout notes:
- `mat4x4f` is 16 floats each, packed - subarrays `(0,16)`, `(16,32)`, etc. align cleanly.
- `vec3f` or `mat3x3f`: leave WGSL padding (4 floats per `vec3f`, 4 per `mat3x3f` column). TypeGPU does **not** add padding for `TypedArray`/`ArrayBuffer` - it copies verbatim.
- `d.sizeOf(Schema)` and `d.memoryLayoutOf(Schema, (s) => s.field).offset` give byte sizes and offsets - use those instead of hardcoded numbers.

### Struct-of-arrays (`common.writeSoA`)

When CPU data is one packed typed array per field (positions, velocities, colours), `common.writeSoA` scatters it into the GPU array-of-structs layout, inserting WGSL padding:

```ts
const Particle = d.struct({ pos: d.vec3f, vel: d.f32 });
const particles = root.createBuffer(d.arrayOf(Particle, 2)).$usage('storage');

common.writeSoA(particles, {
  pos: new Float32Array([1, 2, 3, 4, 5, 6]), // packed: 3 floats per vec3f, 9 per mat3x3f
  vel: new Float32Array([10, 20]),
});
```

- The buffer schema is `d.arrayOf(d.struct(...))`; fields are scalars, vectors, matrices, or fixed-size arrays of those (no nested structs). Every field needs an entry, typed with the field's scalar typed array (`Float32Array` for `f32` fields, `Uint32Array` for `u32`, ...).
- The element count comes from the shortest field array; the third argument `{ startOffset, endOffset }` (bytes, multiples of 4) writes a slice, e.g. from `d.memoryLayoutOf(schema, (a) => a[first]).offset`.

### When the trade-off flips

TypeGPU instances are fine for setup-time data (initial buffer contents), small rarely-written uniforms, and prototypes. Switch to tuples/typed arrays when data is large, written every frame, or showing up in GC traces. Rule of thumb: *if it runs in `requestAnimationFrame`, it should not allocate TypeGPU wrappers.*

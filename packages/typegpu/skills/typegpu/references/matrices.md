# Matrices, `wgpu-matrix`, Cameras, and Fast CPU Writes

Docs: `https://docs.swmansion.com/TypeGPU/integration/working-with-wgpu-matrix.md`.

## `wgpu-matrix` integration

On the CPU, TypeGPU vectors and matrices are indexable (`vec[0]`, `mat[0]`) in the layout `wgpu-matrix` expects, so pass them as sources or as the `dst` argument. With `dst` the function writes into it and returns it; without `dst`, every call allocates a new `Float32Array`. In per-frame code, allocate destinations once at setup and reuse them. Requires `wgpu-matrix` 3.3.0 or newer.

```ts
import { d } from 'typegpu';
import { mat4, vec3 } from 'wgpu-matrix';

const viewM = d.mat4x4f();
mat4.lookAt(eye, target, up, viewM);

mat4.identity(viewM);
mat4.translate(viewM, [tx, ty, tz], viewM);
mat4.rotateY(viewM, yaw, viewM);

const dir = d.vec3f();
vec3.subtract(target, eye, dir);
vec3.normalize(dir, dir);
```

To build matrices inside shaders, `std` has `identity2/3/4`, `translation4`, `scaling4`, `rotationX4/Y4/Z4`, `translate4`, `scale4`, `rotateX4/Y4/Z4`, `transpose`, `determinant` (no inverse); see `references/std.md`.

## Matrix storage is column-major

- `d.mat4x4f(c0, c1, c2, c3)` takes four columns. Row-major input (numpy/HLSL habits) comes out transposed.
- `M * v` applies `M` to `v`. Compose right to left: `projection * view * model * position`.
- In shaders, index with `mat.columns[i]` for the i-th column and `mat.columns[c][r]` for an element; `.columns` works on CPU-side instances too. There `mat[i]` is the i-th float of the padded column-major layout below (not a column), and it throws inside `'use gpu'`.
- `Float32Array` layouts:

  | Schema | Floats | Layout |
  |---|---|---|
  | `d.mat2x2f` | 4 | `[c0.x, c0.y, c1.x, c1.y]` - packed |
  | `d.mat3x3f` | **12** (not 9) | Each column padded to 4 floats: `[c0.x, c0.y, c0.z, PAD, c1..., c2...]` |
  | `d.mat4x4f` | 16 | `[c0.xyzw, c1.xyzw, c2.xyzw, c3.xyzw]` - packed |

  Plain JS arrays (9 numbers for a `mat3x3f`) get padding added automatically; `TypedArray`/`ArrayBuffer` inputs are copied verbatim and must include it. `wgpu-matrix` follows these conventions natively (its `mat3` has 12 slots).

## CPU writes without per-frame allocations

`d.vec3f(...)` and `d.mat4x4f(...)` allocate class instances (a matrix also allocates one vector per column). They are fine for setup-time data, small rarely-written uniforms and prototypes. Anything written every frame (render loops, particle systems, per-instance transforms) or large uses tuples or typed arrays.

Write paths, slowest to fastest:

| Form | Example (`arrayOf(vec3f, N)`) | When to prefer |
|---|---|---|
| TypeGPU instances | `particles.map(p => d.vec3f(p.x, p.y, p.z))` | Small ad-hoc writes, teaching code |
| Plain tuples / arrays | `[[x, y, z], [x, y, z], ...]` | Readable, no wrapper allocation |
| Pre-allocated `Float32Array` | `f32[i * 4] = x; f32[i * 4 + 1] = y; ...` then `buffer.write(f32)` | Hot paths; matches WGSL layout directly |
| The buffer's own host copy | a `Float32Array` over `buffer.arrayBuffer`, then `buffer.write(buffer.arrayBuffer)` | Maximum throughput: no copy on the CPU side |

### Camera uniforms

A struct of `view` and `proj`, plus `viewInv`/`projInv` when shaders go from clip or screen space back to world space (ray marching, screen-space effects). WGSL has no matrix inverse, so compute them with `mat4.invert` on each update. Back the struct with one `Float32Array`, one subarray per matrix, allocated once:

```ts
const Camera = d.struct({
  view: d.mat4x4f, proj: d.mat4x4f,
  viewInv: d.mat4x4f, projInv: d.mat4x4f,
});

const cameraBuffer = root.createBuffer(Camera).$usage('uniform');

const raw     = new Float32Array(d.sizeOf(Camera) / 4); // 64 floats
const view    = raw.subarray(0,  16);
const proj    = raw.subarray(16, 32);
const viewInv = raw.subarray(32, 48);
const projInv = raw.subarray(48, 64);

function updateCamera(eye: Float32Array, target: Float32Array, up: Float32Array, aspect: number) {
  mat4.lookAt(eye, target, up, view);
  mat4.invert(view, viewInv);
  mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, proj);
  mat4.invert(proj, projInv);
  cameraBuffer.write(raw.buffer);
}
```

- For struct schemas, `.write()` accepts a record or an `ArrayBuffer`: pass `raw.buffer`, not the `Float32Array` view (vector/matrix/array schemas accept TypedArrays directly).
- To update one field, recompute into its array and `cameraBuffer.patch({ view })`.
- `mat4x4f` subarrays `(0,16)`, `(16,32)`, ... align cleanly. Around `vec3f` and `mat3x3f` fields follow the WGSL layout: a `vec3f` takes 3 floats but aligns to 4, so a following `f32` fills its fourth slot, and each `mat3x3f` column takes 4 floats.
- Take byte sizes and offsets from `d.sizeOf(Schema)` and `d.memoryLayoutOf(Schema, (s) => s.field).offset` rather than hardcoding them.

`buffer.arrayBuffer` is the CPU-side copy that every `.write()` serializes into before uploading. Writing into it directly and passing it back skips the serialization and the copy:

```ts
const host = new Float32Array(cameraBuffer.arrayBuffer); // create once
mat4.lookAt(eye, target, up, host.subarray(0, 16));
cameraBuffer.write(cameraBuffer.arrayBuffer);
```

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
- The element count comes from the shortest field array; the third argument `{ startOffset, endOffset }` (bytes; `startOffset` on an element boundary) writes a slice, e.g. from `d.memoryLayoutOf(schema, (a) => a[first]).offset`.

# `@typegpu/sdf` - Signed Distance Functions and Operators

Reach for these before hand-porting SDFs. All functions are typed `tgpu.fn`s, composable with `typegpu/std`. Docs: <https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-sdf.md>.

```ts
import * as sdf from '@typegpu/sdf';
// or selectively:
import { sdDisk, sdRoundedBox2d, opSmoothUnion } from '@typegpu/sdf';
```

## 2D primitives

All take `point: vec2f`, return `f32`.

| Function | Extra args | Notes |
|---|---|---|
| `sdDisk(point, radius)` | `radius: f32` | Filled circle |
| `sdBox2d(point, size)` | `size: vec2f` | Axis-aligned rect; `size` is **half-extent** |
| `sdRoundedBox2d(point, size, r)` | `size: vec2f, r: f32` | Rounded rect; `size` is half-extent |
| `sdLine(point, A, B)` | `A, B: vec2f` | **Unsigned** distance to segment `A->B` |
| `sdBezier(point, A, B, C)` | `A, B, C: vec2f` | Exact unsigned distance to quadratic Bezier |
| `sdBezierApprox(point, A, B, C)` | `A, B, C: vec2f` | Fast Bezier approx; cheaper, less accurate near cusps |
| `sdPie(point, sc, radius)` | `sc: vec2f, radius: f32` | Circular sector; `sc = vec2f(sin(halfAngle), cos(halfAngle))` - **precompute on CPU** |
| `sdArc(point, sc, radius)` | `sc: vec2f, radius: f32` | **Unsigned** zero-width arc, midpoint at `(0, radius)`, `sc` as in `sdPie`; subtract a half-width for a stroke |
| `sdHexagon2d(point, radius)` | `radius: f32` | Regular hexagon, flat edges at top and bottom; `radius` is the inradius (center to edge middle) |
| `sdgHexagon2d(point, radius)` | `radius: f32` | Same hexagon, returns `vec3f(distance, gradient.xy)`; gradient undefined exactly on the edge |

> `sdLine`/`sdBezier`/`sdBezierApprox`/`sdArc` return **unsigned** distance (no inside/outside for a curve). Draw AA strokes by comparing against half the stroke width.

## 3D primitives

All take `point: vec3f`, return `f32`.

| Function | Extra args | Notes |
|---|---|---|
| `sdSphere(point, radius)` | `radius: f32` | |
| `sdBox3d(point, size)` | `size: vec3f` | Half-extents |
| `sdRoundedBox3d(point, size, r)` | `size: vec3f, r: f32` | |
| `sdBoxFrame3d(point, size, thickness)` | `size: vec3f, thickness: f32` | Hollow frame (12 edges only) |
| `sdLine3d(point, A, B)` | `A, B: vec3f` | Unsigned distance to 3D segment |
| `sdCapsule(point, A, B, radius)` | `A, B: vec3f, radius: f32` | "Thick line segment" |
| `sdPlane(point, normal, h)` | `normal: vec3f, h: f32` | Infinite plane; `normal` **must be normalized** |
| `sdCappedCylinder(point, r, h)` | `r, h: f32` | Along Y, flat caps at `y = ±h` |
| `sdRhombus3d(point, la, lb, h, ra)` | `la, lb, h, ra: f32` | Rhombus in XZ (half-diagonals `la`, `lb`), extruded ±`h` along Y, rounded by `ra` |
| `sdTriangle3d(point, a, b, c)` | `a, b, c: vec3f` | **Unsigned** distance to a filled zero-thickness triangle |
| `sdTorus(point, majorRadius, minorRadius)` | `majorRadius, minorRadius: f32` | Torus in the XZ plane; `majorRadius` to the tube center, `minorRadius` tube radius |
| `sdCappedTorus(point, sc, majorRadius, minorRadius)` | `sc: vec2f`, radii `f32` | Arc of a torus in the XY plane, midpoint at `(0, majorRadius)`; `sc = vec2f(sin(angle / 2), cos(angle / 2))` |

## Operators

| Operator | Signature | Purpose |
|---|---|---|
| `opUnion(d1, d2)` | `(f32, f32) -> f32` | Hard union (`min(d1, d2)`) |
| `opSmoothUnion(d1, d2, k)` | `(f32, f32, f32) -> f32` | Soft metaball union; `k` = blend radius |
| `opSmoothDifference(d1, d2, k)` | `(f32, f32, f32) -> f32` | Soft subtraction |
| `opExtrudeX(point, d2d, halfHeight)` | `(vec3f, f32, f32) -> f32` | Extrude 2D SDF into a prism along X |
| `opExtrudeY(point, d2d, halfHeight)` | `(vec3f, f32, f32) -> f32` | Along Y |
| `opExtrudeZ(point, d2d, halfHeight)` | `(vec3f, f32, f32) -> f32` | Along Z |

Intersection and sharp difference: use `std.max(d1, d2)` and `std.max(d1, -d2)` directly.

## Calling from shaders

Every function is a `tgpu.fn` with pinned types:
- Callable from plain-callback `'use gpu'` and other `tgpu.fn`s.
- First-class: pass into slots, accessors, or higher-order scene builders.
- **Not polymorphic** - `d.vec2f` for 2D, `d.vec3f` for 3D. TypeScript catches most mismatches.
- Non-vector args are plain `f32` - JS `number` literals work.

```ts
const mask = std.smoothstep(
  std.fwidth(uv.x),
  0,
  sdf.sdRoundedBox2d(uv - 0.5, d.vec2f(0.3, 0.1), 0.02),
);
```

`std.smoothstep(fwidth(uv.x), 0, d)` is the idiomatic 1-pixel AA mask from a 2D SDF in a fragment shader.

## Baking SDF fields into a texture

When the same SDF is sampled many times per frame (AA + normals + shadows + AO all hitting the scene function) and the field changes at most once per frame, **bake into a texture in a compute pass and sample everywhere else**:

```ts
const SIZE = d.vec2u(256, 128);

const sdfTex = root
  .createTexture({ size: [SIZE.x, SIZE.y], format: 'rgba16float' })
  .$usage('storage', 'sampled');
const writeView = sdfTex.createView(d.textureStorage2d('rgba16float', 'write-only'));

const bake = tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x >= SIZE.x || gid.y >= SIZE.y) {
    return;
  }

  const uv = (d.vec2f(gid.xy) + 0.5) / d.vec2f(SIZE);
  const dist = expensiveSceneSDF(uvToWorld(uv));
  std.textureStore(writeView.$, gid.xy, d.vec4f(dist, 0, 0, 1));
});

const bakePipeline = root.createComputePipeline({ compute: bake });

const encoder = root.createCommandEncoder();
bakePipeline.with(encoder).dispatchWorkgroups(Math.ceil(SIZE.x / 8), Math.ceil(SIZE.y / 8));
encoder.submit();
```

Notes:
- **Signed format.** `r16float`/`rgba16float` preserves sign. `r8unorm` works only if you remap into `[0, 1]`.
- **Resolution.** Bilinear is fine for most uses; raise resolution before anything else if you see stepping.
- **Pack extra channels.** `rgba16float` can hold `(dist, progressAlongCurve, normalX, normalY)`.
- **Re-bake only when source geometry changes.** Static fields: bake once at startup.

## Jump flooding — SDF texture from raster content

When the source is pixels rather than an analytic SDF (painted strokes, glyphs, a rendered mask), `createJumpFlood` builds the distance field with the Jump Flood Algorithm. You supply shader callbacks; the executor owns the ping-pong textures and compute passes:

```ts
import { createJumpFlood } from '@typegpu/sdf';

const runner = createJumpFlood({
  root,
  size: { width: 512, height: 512 },
  classify: (coord, size) => {          // true = inside the shape
    'use gpu';
    return std.textureLoad(srcLayout.$.source, coord, 0).w > 0.5;
  },
  getSdf: (coord, size, signedDist) => { // signedDist in pixels, negative inside
    'use gpu';
    return signedDist / d.f32(std.min(size.x, size.y)); // e.g. normalize
  },
  getColor: (coord, size, signedDist, insidePx, outsidePx) => {
    'use gpu';
    return std.textureLoad(srcLayout.$.source, insidePx, 0); // nearest inside pixel
  },
}).with(sourceBindGroup); // .with(bindGroup) supplies resources the callbacks read

runner.run();
runner.sdfOutput;   // rgba16float texture (distance in .x), 'storage' + 'sampled'
runner.colorOutput; // rgba8unorm texture from getColor
```

`runner.initSync()`/`await runner.initAsync()` pre-initialize the pipelines; `runner.destroy()` frees the executor's textures. `run()` takes no encoder and submits its passes itself; call it when the source changes, before the frame that samples the outputs. The SDF runner of `@typegpu/radiance-cascades` can sample these textures for 2D global illumination; see `references/radiance-cascades.md`.

## Bounding shapes for early-out

For unions over many sources (particles, agents, instanced obstacles), reject with a cheap bounding distance before expensive per-source calculation:

```ts
// Given: sources = root.createReadonly(d.arrayOf(Source, MAX)) where Source has
// center/radius fields, count = active source count, K = smooth-blend sharpness.
const fieldAt = tgpu.fn([d.vec3f, d.u32], d.f32)((point, count) => {
  'use gpu';
  let accum = d.f32(0);
  for (let i = d.u32(0); i < count; i++) {
    const src = sources.$[i];
    const rough = std.length(point - src.center) - src.radius;
    if (rough * K > 7) {
      continue; // exp(-K * rough) < 1e-3 past this
    }
    const exact = expensiveSourceSDF(point, src);
    accum += std.exp(-K * exact);
  }
  return accum;
});
```

Two common forms:
- **Skip-when-far.** `if (boundDist > cutoff) { continue; }` - the bound must be a true lower bound.
- **Early ray-march termination.** Return the bound when far from geometry, exact distance only inside a broad region.

## Further reading

For SDFs the package doesn't ship (ellipse, 2D triangle, CSG over meshes):
- **2D:** https://iquilezles.org/articles/distfunctions2d/
- **3D:** https://iquilezles.org/articles/distfunctions/
- **Smooth min:** https://iquilezles.org/articles/smin/

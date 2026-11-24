import { d, std, tgpu, type TgpuVertexLayout } from 'typegpu';
import { map } from './combinators.ts';
import {
  type ConstructibleSchema,
  type Geometry,
  type IndexedGeometry,
  Surface,
} from './geometry.ts';

/**
 * Pairs a vertex schema with a more compact one that it's stored as. `encode` and `decode` are
 * `'use gpu'` functions, so the conversion happens when baking and when reading the baked vertices.
 */
export interface Representation<V extends ConstructibleSchema, P extends ConstructibleSchema> {
  /** The schema the vertices are produced and consumed as */
  readonly schema: V;
  /** The schema the vertices are stored as */
  readonly packed: P;
  encode(this: void, vertex: d.InferGPU<V>): d.InferGPU<P>;
  decode(this: void, packed: d.InferGPU<P>): d.InferGPU<V>;
}

export function encode<V extends ConstructibleSchema, P extends ConstructibleSchema>(
  g: IndexedGeometry<V>,
  representation: Representation<V, P>,
): IndexedGeometry<P>;
export function encode<V extends ConstructibleSchema, P extends ConstructibleSchema>(
  g: Geometry<V>,
  representation: Representation<V, P>,
): Geometry<P>;
export function encode<V extends ConstructibleSchema, P extends ConstructibleSchema>(
  g: Geometry<V>,
  representation: Representation<V, P>,
): Geometry<P> {
  if (g.schema !== representation.schema) {
    throw new Error('encode needs a geometry with the schema of the representation');
  }

  return map(g, representation.packed, representation.encode);
}

export function decode<V extends ConstructibleSchema, P extends ConstructibleSchema>(
  g: IndexedGeometry<P>,
  representation: Representation<V, P>,
): IndexedGeometry<V>;
export function decode<V extends ConstructibleSchema, P extends ConstructibleSchema>(
  g: Geometry<P>,
  representation: Representation<V, P>,
): Geometry<V>;
export function decode<V extends ConstructibleSchema, P extends ConstructibleSchema>(
  g: Geometry<P>,
  representation: Representation<V, P>,
): Geometry<V> {
  if (g.schema !== representation.packed) {
    throw new Error('decode needs a geometry with the packed schema of the representation');
  }

  return map(g, representation.schema, representation.decode);
}

function signNotZero(v: d.v2f) {
  'use gpu';
  return d.vec2f(std.select(d.f32(-1), 1, v.x >= 0), std.select(d.f32(-1), 1, v.y >= 0));
}

/**
 * Maps a unit vector onto the [-1, 1] square by projecting it onto an octahedron and unfolding the
 * lower half over the upper one. A zero vector maps to the origin, which decodes to +Z.
 */
export function octahedralEncode(n: d.v3f): d.v2f {
  'use gpu';
  const sum = std.abs(n.x) + std.abs(n.y) + std.abs(n.z);
  if (sum === 0) {
    return d.vec2f();
  }

  const p = n.xy / sum;
  if (n.z >= 0) {
    return p;
  }

  return (1 - std.abs(p.yx)) * signNotZero(p);
}

/** Inverse of {@link octahedralEncode}. Always returns a unit vector */
export function octahedralDecode(e: d.v2f): d.v3f {
  'use gpu';
  let n = d.vec3f(e.x, e.y, 1 - std.abs(e.x) - std.abs(e.y));
  const t = std.saturate(-n.z);
  n.x += std.select(t, -t, n.x >= 0);
  n.y += std.select(t, -t, n.y >= 0);

  return std.normalize(n);
}

/**
 * {@link Surface} in 20 bytes instead of 48. The position is kept as three scalars, so the struct
 * aligns to 4 bytes instead of the 16 a `vec3f` forces. The normal is octahedron-encoded into two
 * snorm16 values, and the uv is stored as two unorm16 values, so it has to stay within [0, 1].
 */
export const OctahedralSurface = d.struct({
  px: d.f32,
  py: d.f32,
  pz: d.f32,
  normal: d.u32,
  uv: d.u32,
});

export const octahedralSurface: Representation<typeof Surface, typeof OctahedralSurface> = {
  schema: Surface,
  packed: OctahedralSurface,
  encode: (v) => {
    'use gpu';
    return OctahedralSurface({
      px: v.position.x,
      py: v.position.y,
      pz: v.position.z,
      normal: std.pack2x16snorm(octahedralEncode(v.normal)),
      uv: std.pack2x16unorm(v.uv),
    });
  },
  decode: (p) => {
    'use gpu';
    return Surface({
      position: d.vec3f(p.px, p.py, p.pz),
      normal: octahedralDecode(std.unpack2x16snorm(p.normal)),
      uv: std.unpack2x16unorm(p.uv),
    });
  },
};

/**
 * Reads the bytes of an {@link OctahedralSurface} buffer as vertex attributes, letting the vertex
 * fetch unpack the normal and uv. Bind it with the unwrapped buffer, since its schema differs:
 * `pipeline.with(octahedralSurfaceAttribs, root.unwrap(mesh.vertices))`
 */
export const octahedralSurfaceAttribs: TgpuVertexLayout<
  d.Disarray<d.Unstruct<{ position: d.float32x3; normal: d.snorm16x2; uv: d.unorm16x2 }>>
> = tgpu.vertexLayout(
  d.disarrayOf(d.unstruct({ position: d.float32x3, normal: d.snorm16x2, uv: d.unorm16x2 })),
);

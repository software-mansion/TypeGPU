import { d, std, tgpu, type StorageFlag, type TgpuBuffer } from 'typegpu';
import { type Geometry, type IndexedGeometry, isIndexed, type Topology } from './geometry.ts';

function reversedCorner(i: number) {
  'use gpu';
  const corner = i % 3;

  if (corner === 1) {
    return i + 1;
  }
  if (corner === 2) {
    return i - 1;
  }

  return i;
}

function normalMatrixOf(m: d.m4x4f): d.m3x3f {
  'use gpu';
  const c0 = m.columns[0].xyz;
  const c1 = m.columns[1].xyz;
  const c2 = m.columns[2].xyz;
  const det = std.dot(c0, std.cross(c1, c2));

  return d.mat3x3f(std.cross(c1, c2) / det, std.cross(c2, c0) / det, std.cross(c0, c1) / det);
}

export type Placed = d.WgslStruct<{ position: d.Vec3f; normal: d.Vec3f }>;

export function transform<V extends Placed>(g: IndexedGeometry<V>, m: d.m4x4f): IndexedGeometry<V>;
export function transform<V extends Placed>(g: Geometry<V>, m: d.m4x4f): Geometry<V>;
export function transform<V extends Placed>(g: Geometry<V>, m: d.m4x4f): Geometry<V> {
  const matrix = std.copy(m);
  const columns = matrix.columns;

  const determinant = std.dot(columns[0].xyz, std.cross(columns[1].xyz, columns[2].xyz));
  if (
    !Number.isFinite(determinant) ||
    determinant === 0 ||
    columns[0].w !== 0 ||
    columns[1].w !== 0 ||
    columns[2].w !== 0 ||
    columns[3].w !== 1 ||
    ![...columns].every((column) => [...column].every(Number.isFinite))
  ) {
    throw new Error('transform needs a finite invertible affine matrix');
  }
  const normalM = normalMatrixOf(matrix);
  const reflected = determinant < 0 && g.topology === 'triangle-list';
  const reverseVertices = reflected && !isIndexed(g);

  const result = {
    ...g,
    vertexAt: (i: number) => {
      'use gpu';
      let s = std.copy(g.vertexAt(reverseVertices ? reversedCorner(i) : i));
      s.position = (matrix * d.vec4f(s.position, 1)).xyz;

      const normal = normalM * s.normal;
      if (std.dot(normal, normal) > 0) {
        s.normal = std.normalize(normal);
      } else {
        s.normal = d.vec3f();
      }

      return s;
    },
  };

  if (reflected && isIndexed(g)) {
    const indexed: IndexedGeometry<V> = {
      ...result,
      indexCount: g.indexCount,
      indexAt: (i: number) => {
        'use gpu';
        return g.indexAt(reversedCorner(i));
      },
    };
    return indexed;
  }

  return result;
}

export function map<VIn extends d.AnyWgslData, V extends d.AnyWgslData>(
  g: IndexedGeometry<VIn>,
  schema: V,
  fn: (vertex: d.InferGPU<VIn>) => d.InferGPU<V>,
): IndexedGeometry<V>;
export function map<VIn extends d.AnyWgslData, V extends d.AnyWgslData>(
  g: Geometry<VIn>,
  schema: V,
  fn: (vertex: d.InferGPU<VIn>) => d.InferGPU<V>,
): Geometry<V>;
export function map<VIn extends d.AnyWgslData, V extends d.AnyWgslData>(
  g: Geometry<VIn>,
  schema: V,
  fn: (vertex: d.InferGPU<VIn>) => d.InferGPU<V>,
): Geometry<V> {
  return {
    ...g,
    schema,
    vertexAt: (i: number) => {
      'use gpu';
      return fn(g.vertexAt(i));
    },
  };
}

export type Attached<VIn extends d.WgslStruct, E extends d.WgslStruct> = d.WgslStruct<
  VIn['propTypes'] & E['propTypes']
>;

const attachedSchemas = new WeakMap<d.WgslStruct, WeakMap<d.WgslStruct, d.WgslStruct>>();

function attachedSchema<VIn extends d.WgslStruct, E extends d.WgslStruct>(
  base: VIn,
  extra: E,
): Attached<VIn, E> {
  for (const key of Object.keys(extra.propTypes)) {
    if (Object.hasOwn(base.propTypes, key)) {
      throw new Error(`attach cannot replace the existing field '${key}'; use map instead`);
    }
  }

  let byExtra = attachedSchemas.get(base);
  if (!byExtra) {
    byExtra = new WeakMap();
    attachedSchemas.set(base, byExtra);
  }

  let schema = byExtra.get(extra);
  if (!schema) {
    const Vertex = d.struct({ ...base.propTypes, ...extra.propTypes } as Record<
      string,
      d.AnyWgslData
    >);
    byExtra.set(extra, Vertex);
    schema = Vertex;
  }

  return schema as Attached<VIn, E>;
}

export function attach<VIn extends d.WgslStruct, E extends d.WgslStruct>(
  g: IndexedGeometry<VIn>,
  extra: E,
  fn: (vertex: d.InferGPU<VIn>) => d.InferGPU<E>,
): IndexedGeometry<Attached<VIn, E>>;
export function attach<VIn extends d.WgslStruct, E extends d.WgslStruct>(
  g: Geometry<VIn>,
  extra: E,
  fn: (vertex: d.InferGPU<VIn>) => d.InferGPU<E>,
): Geometry<Attached<VIn, E>>;
export function attach<VIn extends d.WgslStruct, E extends d.WgslStruct>(
  g: Geometry<VIn>,
  extra: E,
  fn: (vertex: d.InferGPU<VIn>) => d.InferGPU<E>,
): Geometry<Attached<VIn, E>> {
  const schema = attachedSchema(g.schema, extra);
  const baseKeys = Object.keys(g.schema.propTypes);
  const extraKeys = Object.keys(extra.propTypes);

  return {
    ...g,
    schema,
    vertexAt: (i: number) => {
      'use gpu';
      const s = g.vertexAt(i);
      const e = fn(s);

      let out: Record<string, unknown> = schema();
      for (const key of tgpu.unroll(baseKeys)) {
        out[key] = std.copy(s[key]);
      }
      for (const key of tgpu.unroll(extraKeys)) {
        out[key] = std.copy(e[key]);
      }

      return out as d.InferGPU<Attached<VIn, E>>;
    },
  };
}

export function unindexed<V extends d.AnyWgslData>(g: Geometry<V>): Geometry<V> {
  if (!isIndexed(g)) {
    return g;
  }

  return {
    schema: g.schema,
    topology: g.topology,
    vertexCount: g.indexCount,
    vertexAt: (i: number) => {
      'use gpu';
      return g.vertexAt(g.indexAt(i));
    },
  };
}

type ConstructibleSchema = Extract<d.AnyWgslData, () => unknown>;

export function concat<V extends ConstructibleSchema>(...parts: Geometry<V>[]): IndexedGeometry<V> {
  const first = parts[0];
  if (!first) {
    throw new Error('concat needs at least one geometry');
  }

  const schema = first.schema;
  const topology = first.topology;

  for (const g of parts) {
    if (g.schema !== schema) {
      throw new Error('concat needs one vertex schema across all of its parts');
    }
    if (g.topology !== topology) {
      throw new Error(
        `concat needs one topology across all of its parts, got '${topology}' and '${g.topology}'`,
      );
    }
  }

  const vertexCount = parts.reduce((n, g) => n + g.vertexCount, 0);

  const vertexAt = (i: number) => {
    'use gpu';
    let local = i;
    for (const g of tgpu.unroll(parts)) {
      if (local < g.vertexCount) {
        return g.vertexAt(local);
      }
      local -= g.vertexCount;
    }

    return schema() as d.InferGPU<V>;
  };

  let offset = 0;
  const entries = parts.map((g) => {
    const indexCount = isIndexed(g) ? g.indexCount : g.vertexCount;
    const indexAt = isIndexed(g)
      ? g.indexAt
      : (i: number) => {
          'use gpu';
          return i;
        };
    const entry = { indexAt, indexCount, vertexOffset: offset };
    offset += g.vertexCount;
    return entry;
  });

  const result: IndexedGeometry<V> = {
    schema,
    topology,
    vertexCount,
    vertexAt,
    indexCount: entries.reduce((n, e) => n + e.indexCount, 0),
    indexAt: (i: number) => {
      'use gpu';
      let local = i;
      for (const e of tgpu.unroll(entries)) {
        if (local < e.indexCount) {
          return e.indexAt(local) + e.vertexOffset;
        }
        local -= e.indexCount;
      }

      return d.u32(0);
    },
  };

  return result;
}

type VertexSource<V extends d.AnyWgslData> = TgpuBuffer<d.WgslArray<V>> & StorageFlag;
type IndexSource = TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;

export interface FromBufferOptions {
  indices?: IndexSource;
  topology?: Topology;
  vertexCount?: number;
  indexCount?: number;
}

export function fromBuffer<V extends d.AnyWgslData>(
  vertices: VertexSource<V>,
  options: FromBufferOptions & { indices: IndexSource },
): IndexedGeometry<V>;
export function fromBuffer<V extends d.AnyWgslData>(
  vertices: VertexSource<V>,
  options?: FromBufferOptions,
): Geometry<V>;
export function fromBuffer<V extends d.AnyWgslData>(
  vertices: VertexSource<V>,
  options: FromBufferOptions = {},
): Geometry<V> {
  const indices = options.indices;
  const topology = options.topology ?? 'triangle-list';
  const vertexCount = options.vertexCount ?? vertices.dataType.elementCount;
  const indexCount = options.indexCount ?? indices?.dataType.elementCount ?? 0;

  for (const [kind, count, capacity] of [
    ['vertex', vertexCount, vertices.dataType.elementCount],
    ['index', indexCount, indices?.dataType.elementCount ?? 0],
  ] as const) {
    if (!Number.isSafeInteger(count) || count < 0 || count > capacity) {
      throw new Error(`The ${kind} count must be an integer between 0 and ${capacity}`);
    }
  }

  const readVertices = vertices.as('readonly');
  const base: Geometry<V> = {
    schema: vertices.dataType.elementType,
    topology,
    vertexCount,
    vertexAt: (i: number) => {
      'use gpu';
      return std.copy(readVertices.$[i]) as d.InferGPU<V>;
    },
  };

  if (!indices) {
    return base;
  }

  const readIndices = indices.as('readonly');
  const result: IndexedGeometry<V> = {
    ...base,
    indexCount,
    indexAt: (i: number) => {
      'use gpu';
      return readIndices.$[i] as number;
    },
  };

  return result;
}

import {
  d,
  std,
  type IndexFlag,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuRenderPipeline,
  type TgpuRoot,
  type TgpuVertexLayout,
  type VertexFlag,
  type WithBinding,
} from 'typegpu';
import { createFill, type Fill, recordFills, type UpdateOptions } from './fill.ts';
import {
  type ConstructibleSchema,
  type Geometry,
  type IndexedGeometry,
  isIndexed,
  layoutOf,
} from './geometry.ts';

export type { RecordOptions, UpdateOptions } from './fill.ts';

type HasIndexBuffer = Pick<
  ReturnType<TgpuRenderPipeline['withIndexBuffer']>,
  'hasIndexBuffer' | 'drawIndexed'
>;

export type VertexBuffer<V extends ConstructibleSchema> = TgpuBuffer<d.WgslArray<V>> &
  VertexFlag &
  StorageFlag;
export type IndexBuffer = TgpuBuffer<d.WgslArray<d.U32>> & IndexFlag & StorageFlag;

export interface Baked<V extends ConstructibleSchema> extends Geometry<V> {
  readonly vertices: VertexBuffer<V>;
  /**
   * Index of the mesh's first vertex in `vertices`. Pass it as `baseVertex` to `drawIndexed` or as
   * `firstVertex` to `draw`. `vertexAt` already adds it.
   */
  readonly baseVertex: number;
  readonly layout: TgpuVertexLayout<d.WgslArray<V>>;
  inject(): <P extends TgpuRenderPipeline>(pipeline: P) => P;
  updateVertices(this: void, options?: UpdateOptions): void;
  destroy(): void;
}

export interface BakedIndexed<V extends ConstructibleSchema> extends Baked<V>, IndexedGeometry<V> {
  readonly indices: IndexBuffer;
  /** Index of the mesh's first index in `indices`. Pass it as `firstIndex` when drawing */
  readonly firstIndex: number;
  inject(): <P extends TgpuRenderPipeline>(pipeline: P) => P & HasIndexBuffer;
}

export type BakeOptions<V extends ConstructibleSchema> = UpdateOptions & {
  /** Writes into this buffer instead of creating one. `destroy()` leaves it alive */
  vertices?: VertexBuffer<V>;
  /** Writes into this buffer instead of creating one. `destroy()` leaves it alive */
  indices?: IndexBuffer;
  /** Writes the first vertex at this index of `vertices`. Indices stay relative to it. Default 0 */
  baseVertex?: number;
  /** Writes the first index at this index of `indices`. Default 0 */
  firstIndex?: number;
  /** Creates the fill pipelines from this configured root, for slots and accessors */
  with?: WithBinding;
};

interface Prepared<T> {
  mesh: T;
  fills: Fill[];
}

function fits(kind: string, capacity: number, first: number, count: number) {
  if (first + count > capacity) {
    throw new Error(
      `The ${kind} range ${first}..${first + count} exceeds the buffer capacity ${capacity}`,
    );
  }
}

function finish<T>(root: TgpuRoot, { mesh, fills }: Prepared<T>, options: UpdateOptions): T {
  recordFills(root, fills, options);
  return mesh;
}

async function finishAsync<T>(
  root: TgpuRoot,
  prepared: Prepared<T>,
  options: UpdateOptions,
): Promise<T> {
  await Promise.all(prepared.fills.map((fill) => fill.initAsync()));
  return finish(root, prepared, options);
}

export function bake<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options?: BakeOptions<V>,
): BakedIndexed<V>;
export function bake<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: Geometry<V>,
  options?: BakeOptions<V>,
): Baked<V>;
export function bake<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: Geometry<V>,
  options: BakeOptions<V> = {},
): Baked<V> {
  return finish(root, prepareBake(root, g, options), options);
}

export function bakeAsync<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options?: BakeOptions<V>,
): Promise<BakedIndexed<V>>;
export function bakeAsync<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: Geometry<V>,
  options?: BakeOptions<V>,
): Promise<Baked<V>>;
export async function bakeAsync<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: Geometry<V>,
  options: BakeOptions<V> = {},
): Promise<Baked<V>> {
  return finishAsync(root, prepareBake(root, g, options), options);
}

function prepareBake<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: Geometry<V>,
  options: BakeOptions<V>,
): Prepared<Baked<V>> {
  const { schema, topology, vertexCount } = g;
  const { baseVertex = 0 } = options;
  const indexed = isIndexed(g) ? g : undefined;

  const vertices =
    options.vertices ??
    (root
      .createBuffer(d.arrayOf(schema, Math.max(1, vertexCount)) as d.WgslArray<d.AnyWgslData>)
      .$usage('vertex', 'storage') as unknown as VertexBuffer<V>);
  fits('vertex', vertices.dataType.elementCount, baseVertex, vertexCount);

  const output = vertices.as('mutable');
  const fillVertices = createFill(
    options.with ?? root,
    vertexCount,
    (i) => {
      'use gpu';
      output.$[baseVertex === 0 ? i : baseVertex + i] = g.vertexAt(i);
    },
    options.bindGroups,
  );

  const readVertices = vertices.as('readonly');
  const layout = layoutOf(schema);
  const mesh = {
    schema,
    topology,
    vertexCount,
    vertexAt: (i: number) => {
      'use gpu';
      return std.copy(readVertices.$[baseVertex === 0 ? i : baseVertex + i]) as d.InferGPU<V>;
    },
    vertices,
    baseVertex,
    layout,
    updateVertices: (update: UpdateOptions = {}) => recordFills(root, [fillVertices], update),
  };

  if (!indexed) {
    return {
      mesh: {
        ...mesh,
        inject: () => (pipeline) => pipeline.with(layout, vertices),
        destroy: () => {
          if (!options.vertices) {
            vertices.destroy();
          }
        },
      },
      fills: [fillVertices],
    };
  }

  const { mesh: indexOnly, fills } = prepareIndices(root, indexed, options);
  const indexedMesh: BakedIndexed<V> = {
    ...mesh,
    indices: indexOnly.indices,
    firstIndex: indexOnly.firstIndex,
    indexCount: indexOnly.indexCount,
    indexAt: indexOnly.indexAt,
    inject: () => (pipeline) => pipeline.with(layout, vertices).withIndexBuffer(indexOnly.indices),
    destroy: () => {
      if (!options.vertices) {
        vertices.destroy();
      }
      indexOnly.destroy();
    },
  };
  return { mesh: indexedMesh, fills: [fillVertices, ...fills] };
}

export type BakeIndicesOptions = UpdateOptions & {
  /** Writes into this buffer instead of creating one. `destroy()` leaves it alive */
  indices?: IndexBuffer;
  /** Writes the first index at this index of `indices`. Default 0 */
  firstIndex?: number;
  /** Creates the fill pipeline from this configured root, for slots and accessors */
  with?: WithBinding;
};

export interface BakedIndices<V extends ConstructibleSchema> extends IndexedGeometry<V> {
  readonly indices: IndexBuffer;
  /** Index of the mesh's first index in `indices`. Pass it as `firstIndex` when drawing */
  readonly firstIndex: number;
  inject(): <P extends TgpuRenderPipeline>(pipeline: P) => P & HasIndexBuffer;
  destroy(): void;
}

export function bakeIndices<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options: BakeIndicesOptions = {},
): BakedIndices<V> {
  return finish(root, prepareIndices(root, g, options), options);
}

export async function bakeIndicesAsync<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options: BakeIndicesOptions = {},
): Promise<BakedIndices<V>> {
  return finishAsync(root, prepareIndices(root, g, options), options);
}

function prepareIndices<V extends ConstructibleSchema>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options: BakeIndicesOptions,
): Prepared<BakedIndices<V>> {
  const { firstIndex = 0 } = options;
  const indices =
    options.indices ??
    root.createBuffer(d.arrayOf(d.u32, Math.max(1, g.indexCount))).$usage('index', 'storage');
  fits('index', indices.dataType.elementCount, firstIndex, g.indexCount);

  const output = indices.as('mutable');
  const fill = createFill(
    options.with ?? root,
    g.indexCount,
    (i) => {
      'use gpu';
      output.$[firstIndex === 0 ? i : firstIndex + i] = g.indexAt(i);
    },
    options.bindGroups,
  );

  const readIndices = indices.as('readonly');
  return {
    mesh: {
      ...g,
      indices,
      firstIndex,
      indexAt: (i: number) => {
        'use gpu';
        return readIndices.$[firstIndex === 0 ? i : firstIndex + i] as number;
      },
      inject: () => (pipeline) => pipeline.withIndexBuffer(indices),
      destroy: () => {
        if (!options.indices) {
          indices.destroy();
        }
      },
    },
    fills: [fill],
  };
}

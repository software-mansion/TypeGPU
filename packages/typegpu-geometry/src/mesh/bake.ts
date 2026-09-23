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
import { createFill, type UpdateOptions } from './fill.ts';
import { type Geometry, type IndexedGeometry, isIndexed, layoutOf } from './geometry.ts';

export type { UpdateOptions } from './fill.ts';

// TODO: use HasIndexBuffer from typegpu once it's exported
type HasIndexBuffer = Pick<
  ReturnType<TgpuRenderPipeline['withIndexBuffer']>,
  'hasIndexBuffer' | 'drawIndexed'
>;

export type VertexBuffer<V extends d.AnyWgslData> = TgpuBuffer<d.WgslArray<V>> &
  VertexFlag &
  StorageFlag;
export type IndexBuffer = TgpuBuffer<d.WgslArray<d.U32>> & IndexFlag & StorageFlag;

export interface Baked<V extends d.AnyWgslData> extends Geometry<V> {
  readonly vertices: VertexBuffer<V>;
  readonly layout: TgpuVertexLayout<d.WgslArray<V>>;
  inject(): <P extends TgpuRenderPipeline>(pipeline: P) => P;
  updateVertices(this: void, options?: UpdateOptions): void;
  destroy(): void;
}

export interface BakedIndexed<V extends d.AnyWgslData> extends Baked<V>, IndexedGeometry<V> {
  readonly indices: IndexBuffer;
  inject(): <P extends TgpuRenderPipeline>(pipeline: P) => P & HasIndexBuffer;
}

export interface BakeOptions<V extends d.AnyWgslData> extends UpdateOptions {
  vertices?: VertexBuffer<V>;
  indices?: IndexBuffer;
  with?: WithBinding;
}

interface Prepared<T> {
  mesh: T;
  fills: ReturnType<typeof createFill>[];
}

function fits(kind: string, capacity: number, needed: number) {
  if (needed > capacity) {
    throw new Error(`The ${kind} count ${needed} exceeds the buffer capacity ${capacity}`);
  }
}

function finish<T>(root: TgpuRoot, { mesh, fills }: Prepared<T>, options: UpdateOptions): T {
  if (options.encoder || options.pass) {
    for (const fill of fills) fill.run(options);
    return mesh;
  }
  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginComputePass();
  for (const fill of fills) fill.run({ ...options, pass });
  pass.end();
  encoder.submit();
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

export function bake<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options?: BakeOptions<V>,
): BakedIndexed<V>;
export function bake<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: Geometry<V>,
  options?: BakeOptions<V>,
): Baked<V>;
export function bake<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: Geometry<V>,
  options: BakeOptions<V> = {},
): Baked<V> {
  return finish(root, prepareBake(root, g, options), options);
}

export function bakeAsync<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options?: BakeOptions<V>,
): Promise<BakedIndexed<V>>;
export function bakeAsync<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: Geometry<V>,
  options?: BakeOptions<V>,
): Promise<Baked<V>>;
export async function bakeAsync<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: Geometry<V>,
  options: BakeOptions<V> = {},
): Promise<Baked<V>> {
  return finishAsync(root, prepareBake(root, g, options), options);
}

function prepareBake<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: Geometry<V>,
  options: BakeOptions<V>,
): Prepared<Baked<V>> {
  const { schema, topology, vertexCount } = g;
  const indexed = isIndexed(g) ? g : undefined;
  const indexCount = indexed?.indexCount ?? 0;

  const vertices =
    options.vertices ??
    (root
      .createBuffer(d.arrayOf(schema, Math.max(1, vertexCount)) as d.WgslArray<d.AnyWgslData>)
      .$usage('vertex', 'storage') as unknown as VertexBuffer<V>);
  fits('vertex', vertices.dataType.elementCount, vertexCount);

  const indices = indexed
    ? (options.indices ??
      root.createBuffer(d.arrayOf(d.u32, Math.max(1, indexCount))).$usage('index', 'storage'))
    : undefined;
  if (indices) fits('index', indices.dataType.elementCount, indexCount);

  const pipelineRoot = options.with ?? root;
  const output = vertices.as('mutable');
  const fillVertices = createFill(
    pipelineRoot,
    vertexCount,
    (i) => {
      'use gpu';
      output.$[i] = g.vertexAt(i);
    },
    options.bindGroups,
  );
  const fills = [fillVertices];

  const readVertices = vertices.as('readonly');
  const layout = layoutOf(schema);
  const mesh = {
    schema,
    topology,
    vertexCount,
    vertexAt: (i: number) => {
      'use gpu';
      return std.copy(readVertices.$[i]) as d.InferGPU<V>;
    },
    vertices,
    layout,
    updateVertices: fillVertices.run,
    destroy: () => {
      if (!options.vertices) vertices.destroy();
      if (!options.indices) indices?.destroy();
    },
  };

  if (!indexed || !indices) {
    return {
      mesh: { ...mesh, inject: () => (pipeline) => pipeline.with(layout, vertices) },
      fills,
    };
  }

  const writeIndices = indices.as('mutable');
  fills.push(
    createFill(
      pipelineRoot,
      indexCount,
      (i) => {
        'use gpu';
        writeIndices.$[i] = indexed.indexAt(i);
      },
      options.bindGroups,
    ),
  );

  const readIndices = indices.as('readonly');
  const indexedMesh: BakedIndexed<V> = {
    ...mesh,
    indices,
    indexCount,
    indexAt: (i: number) => {
      'use gpu';
      return readIndices.$[i] as number;
    },
    inject: () => (pipeline) => pipeline.with(layout, vertices).withIndexBuffer(indices),
  };
  return { mesh: indexedMesh, fills };
}

export interface BakeIndicesOptions extends UpdateOptions {
  indices?: IndexBuffer;
  with?: WithBinding;
}

export interface BakedIndices<V extends d.AnyWgslData> extends IndexedGeometry<V> {
  readonly indices: IndexBuffer;
  inject(): <P extends TgpuRenderPipeline>(pipeline: P) => P & HasIndexBuffer;
  destroy(): void;
}

export function bakeIndices<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options: BakeIndicesOptions = {},
): BakedIndices<V> {
  return finish(root, prepareIndices(root, g, options), options);
}

export async function bakeIndicesAsync<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options: BakeIndicesOptions = {},
): Promise<BakedIndices<V>> {
  return finishAsync(root, prepareIndices(root, g, options), options);
}

function prepareIndices<V extends d.AnyWgslData>(
  root: TgpuRoot,
  g: IndexedGeometry<V>,
  options: BakeIndicesOptions,
): Prepared<BakedIndices<V>> {
  const indices =
    options.indices ??
    root.createBuffer(d.arrayOf(d.u32, Math.max(1, g.indexCount))).$usage('index', 'storage');
  fits('index', indices.dataType.elementCount, g.indexCount);

  const output = indices.as('mutable');
  const fill = createFill(
    options.with ?? root,
    g.indexCount,
    (i) => {
      'use gpu';
      output.$[i] = g.indexAt(i);
    },
    options.bindGroups,
  );

  return {
    mesh: {
      ...g,
      indices,
      inject: () => (pipeline) => pipeline.withIndexBuffer(indices),
      destroy: () => {
        if (!options.indices) indices.destroy();
      },
    },
    fills: [fill],
  };
}

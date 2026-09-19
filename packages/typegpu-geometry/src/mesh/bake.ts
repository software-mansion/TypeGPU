import {
  d,
  type HasIndexBuffer,
  type IndexFlag,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuRenderPipeline,
  type TgpuRoot,
  type TgpuVertexLayout,
  type VertexFlag,
  type WithBinding,
} from 'typegpu';
import { fromBuffer } from './combinators.ts';
import { createFill, type UpdateOptions } from './fill.ts';
import { type Geometry, type IndexedGeometry, isIndexed, layoutOf } from './geometry.ts';

export type { UpdateOptions } from './fill.ts';

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

function fits(kind: string, capacity: number, needed: number) {
  if (!Number.isSafeInteger(needed) || needed < 0 || needed > capacity) {
    throw new Error(`The ${kind} count must be an integer between 0 and ${capacity}`);
  }
}

function record(root: TgpuRoot, options: UpdateOptions, fills: ReturnType<typeof createFill>[]) {
  if (options.encoder && options.pass) {
    throw new Error('Supply either an encoder or a compute pass, not both');
  }
  if (options.encoder || options.pass) {
    for (const fill of fills) fill.run(options);
    return;
  }
  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginComputePass();
  for (const fill of fills) fill.run({ ...options, pass });
  pass.end();
  encoder.submit();
}

interface Prepared<T extends { destroy(): void }> {
  mesh: T;
  fills: ReturnType<typeof createFill>[];
}

function finish<T extends { destroy(): void }>(
  root: TgpuRoot,
  prepared: Prepared<T>,
  options: UpdateOptions,
): T {
  try {
    record(root, options, prepared.fills);
    return prepared.mesh;
  } catch (error) {
    prepared.mesh.destroy();
    throw error;
  }
}

async function finishAsync<T extends { destroy(): void }>(
  root: TgpuRoot,
  prepared: Prepared<T>,
  options: UpdateOptions,
): Promise<T> {
  try {
    await Promise.all(prepared.fills.map((fill) => fill.initAsync()));
  } catch (error) {
    prepared.mesh.destroy();
    throw error;
  }
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
  fits('vertex', 0xffffffff, vertexCount);
  fits('index', 0xffffffff, indexCount);
  const owned: { destroy(): void }[] = [];
  const destroy = () => owned.forEach((resource) => resource.destroy());

  try {
    const vertices =
      options.vertices ??
      (root
        .createBuffer(d.arrayOf(schema, Math.max(1, vertexCount)) as d.WgslArray<d.AnyWgslData>)
        .$usage('vertex', 'storage') as unknown as VertexBuffer<V>);
    if (!options.vertices) owned.push(vertices);
    fits('vertex', vertices.dataType.elementCount, vertexCount);

    const indices = indexed
      ? (options.indices ??
        root.createBuffer(d.arrayOf(d.u32, Math.max(1, indexCount))).$usage('index', 'storage'))
      : undefined;
    if (indices) {
      if (!options.indices) owned.push(indices);
      fits('index', indices.dataType.elementCount, indexCount);
    }
    const output = vertices.as('mutable');
    const writeIndices = indices?.as('mutable');
    const pipelineRoot = options.with ?? root;
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
    if (indexed && writeIndices) {
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
    }

    const layout = layoutOf(schema);
    const mesh = {
      vertices,
      layout,
      updateVertices: fillVertices.run,
      destroy,
    };
    if (indices) {
      const indexedMesh: BakedIndexed<V> = {
        ...fromBuffer(vertices, { indices, topology, vertexCount, indexCount }),
        ...mesh,
        indices,
        inject: () => (pipeline) => pipeline.with(layout, vertices).withIndexBuffer(indices),
      };
      return { mesh: indexedMesh, fills };
    }
    return {
      mesh: {
        ...fromBuffer(vertices, { topology, vertexCount }),
        ...mesh,
        inject: () => (pipeline) => pipeline.with(layout, vertices),
      },
      fills,
    };
  } catch (error) {
    destroy();
    throw error;
  }
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
  fits('index', 0xffffffff, g.indexCount);
  const indices =
    options.indices ??
    root.createBuffer(d.arrayOf(d.u32, Math.max(1, g.indexCount))).$usage('index', 'storage');
  const destroy = () => {
    if (!options.indices) indices.destroy();
  };
  try {
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
        destroy,
      },
      fills: [fill],
    };
  } catch (error) {
    destroy();
    throw error;
  }
}

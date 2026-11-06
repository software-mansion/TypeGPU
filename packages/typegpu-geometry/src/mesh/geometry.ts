import { d, tgpu, type TgpuVertexLayout } from 'typegpu';

/** Default vertex schema for primitives */
export const Surface = d.struct({ position: d.vec3f, normal: d.vec3f, uv: d.vec2f });

/** Vertex schemas a 'use gpu' function can return */
export type ConstructibleSchema = Extract<d.AnyWgslData, () => unknown>;

export type Topology = 'triangle-list' | 'line-list' | 'point-list';

export interface Geometry<V extends ConstructibleSchema = typeof Surface> {
  readonly schema: V;
  readonly topology: Topology;
  readonly vertexCount: number;

  vertexAt(this: void, i: number): d.InferGPU<V>;
}

export interface IndexedGeometry<
  V extends ConstructibleSchema = typeof Surface,
> extends Geometry<V> {
  readonly indexCount: number;

  indexAt(this: void, i: number): number;
}

const layouts = new WeakMap<d.AnyWgslData, TgpuVertexLayout>();

export function isIndexed<V extends ConstructibleSchema>(g: Geometry<V>): g is IndexedGeometry<V> {
  return typeof (g as IndexedGeometry<V>).indexAt === 'function';
}

export function layoutOf<V extends ConstructibleSchema>(
  schema: V,
): TgpuVertexLayout<d.WgslArray<V>> {
  let layout = layouts.get(schema);
  if (!layout) {
    layout = tgpu.vertexLayout(d.arrayOf(schema));
    layouts.set(schema, layout);
  }

  return layout as TgpuVertexLayout<d.WgslArray<V>>;
}

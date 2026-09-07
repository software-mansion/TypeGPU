import { d, tgpu, type TgpuVertexLayout } from 'typegpu';

/** Default vertex schema for primitives */
export const Surface = d.struct({ position: d.vec3f, normal: d.vec3f, uv: d.vec2f });

export type Topology = 'triangle-list' | 'line-list' | 'point-list';

export interface Geometry<V extends d.AnyWgslData = typeof Surface> {
  readonly schema: V;
  readonly topology: Topology;
  readonly vertexCount: number;

  vertexAt(this: void, i: number): d.InferGPU<V>;
}

export interface IndexedGeometry<V extends d.AnyWgslData = typeof Surface> extends Geometry<V> {
  readonly indexCount: number;

  indexAt(this: void, i: number): number;
}

const layouts = new WeakMap<d.AnyWgslData, TgpuVertexLayout>();

export function isIndexed<V extends d.AnyWgslData>(g: Geometry<V>): g is IndexedGeometry<V> {
  return typeof (g as IndexedGeometry<V>).indexAt === 'function';
}

export function layoutOf<V extends d.AnyWgslData>(schema: V): TgpuVertexLayout<d.WgslArray<V>> {
  let layout = layouts.get(schema);
  if (!layout) {
    layout = tgpu.vertexLayout(d.arrayOf(schema));
    layouts.set(schema, layout);
  }

  return layout as TgpuVertexLayout<d.WgslArray<V>>;
}

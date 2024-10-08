import type { TgpuArray, TgpuLooseArray } from '../../data';
import type { VertexFormat } from '../../shared/vertexFormat';
import type { AnyTgpuData, AnyTgpuLooseData } from '../../types';
import type { TgpuBuffer } from './buffer';

/**
 * @param TData
 *   The data-type/format of the vertex attribute,
 *   e.g., vec3f, uint32x4, ...
 */
export interface TgpuVertexAttrib<
  TData extends AnyTgpuData | AnyTgpuLooseData,
> {
  readonly dataType: TData;
  readonly offset: number;
  readonly format: VertexFormat;
}

export type DataToAttribs<T> = T extends TgpuArray<infer Element>
  ? Element
  : T extends TgpuLooseArray<infer Element>
    ? Element
    : never;

export interface TgpuBufferVertex<TData extends AnyTgpuData> {
  readonly buffer: TgpuBuffer<TData>;
  readonly resourceType: 'buffer-vertex-usage';
  readonly vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'>;
}

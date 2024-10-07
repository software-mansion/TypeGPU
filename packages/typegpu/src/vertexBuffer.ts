import type { AnyTgpuData } from './types';

export interface TgpuVertexAttrib<TData extends AnyTgpuData> {
  readonly resourceType: 'buffer-usage';
  readonly dataType: TData;
  vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'>;
}

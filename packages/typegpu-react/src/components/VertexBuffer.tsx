import { useEffect } from 'react';
import  type {
  TgpuBuffer,
  TgpuVertexLayout,
  VertexFlag,
} from 'typegpu';
import type { Disarray, WgslArray } from 'typegpu/data';
import { usePass } from '../hooks/use-pass.ts';

export type VertexBufferProps<TData extends WgslArray | Disarray> ={
  layout: TgpuVertexLayout<TData>;
  buffer: TgpuBuffer<TData> & VertexFlag;
}

export function VertexBuffer<TData extends WgslArray | Disarray>({
  layout,
  buffer,
}: VertexBufferProps<TData>) {
  const { addDrawCall } = usePass();

  useEffect(() => {
    return addDrawCall((pass) => {
      pass.setVertexBuffer(layout, buffer);
    });
  }, [addDrawCall, layout, buffer]);

  return null;
}
import type { AnyTgpuData, Wgsl } from '../types';

export type Value<TData extends AnyTgpuData> = {
  dataType: TData;
  code: Wgsl;
};

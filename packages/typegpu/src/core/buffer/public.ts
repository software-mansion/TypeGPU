import type { AnyData } from '../../data/dataTypes';
import type { Exotic } from '../../data/exotic';
import type { TgpuBuffer as INTERNAL_TgpuBuffer } from './buffer';
import type {
  TgpuBufferMutable as INTERNAL_TgpuBufferMutable,
  TgpuBufferReadonly as INTERNAL_TgpuBufferReadonly,
  TgpuBufferUniform as INTERNAL_TgpuBufferUniform,
} from './bufferUsage';

export type TgpuBuffer<TData extends AnyData> = INTERNAL_TgpuBuffer<
  Exotic<TData>
>;

export type TgpuBufferMutable<TData extends AnyData> =
  INTERNAL_TgpuBufferMutable<Exotic<TData>>;

export type TgpuBufferReadonly<TData extends AnyData> =
  INTERNAL_TgpuBufferReadonly<Exotic<TData>>;

export type TgpuBufferUniform<TData extends AnyData> =
  INTERNAL_TgpuBufferUniform<Exotic<TData>>;

// Reexporting as-is
export type { Uniform, Vertex } from './buffer';

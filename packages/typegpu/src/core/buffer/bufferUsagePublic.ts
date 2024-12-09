import type { AnyData } from '../../data/dataTypes';
import type { Exotic } from '../../data/exotic';
import type {
  TgpuBufferMutable as INTERNAL_TgpuBufferMutable,
  TgpuBufferReadonly as INTERNAL_TgpuBufferReadonly,
  TgpuBufferUniform as INTERNAL_TgpuBufferUniform,
} from './bufferUsage';

export type TgpuBufferMutable<TData extends AnyData> =
  INTERNAL_TgpuBufferMutable<Exotic<TData>>;

export type TgpuBufferReadonly<TData extends AnyData> =
  INTERNAL_TgpuBufferReadonly<Exotic<TData>>;

export type TgpuBufferUniform<TData extends AnyData> =
  INTERNAL_TgpuBufferUniform<Exotic<TData>>;

import { type BaseData } from '../../data/wgslTypes.ts';
import type { TgpuMutable, TgpuReadonly, TgpuUniform } from './bufferBinding.ts';

// TODO(#2666) - remove this file

// ----------
// Public API
// ----------

/**
 * @deprecated use TgpuUniform instead.
 */
export type TgpuBufferUniform<TData extends BaseData> = TgpuUniform<TData>;

/**
 * @deprecated use TgpuReadonly instead.
 */
export type TgpuBufferReadonly<TData extends BaseData> = TgpuReadonly<TData>;

/**
 * @deprecated use TgpuMutable instead.
 */
export type TgpuBufferMutable<TData extends BaseData> = TgpuMutable<TData>;

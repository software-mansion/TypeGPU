/**
 * @module typegpu
 */

import { tgpu } from './tgpu';

export { RecursiveDataTypeError } from './errors';
export {
  TgpuData,
  AnyTgpuData,
  TexelFormat,
} from './types';
export { std } from './std';

export type { TgpuBuffer } from './wgslBuffer';

export default tgpu;

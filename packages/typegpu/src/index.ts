/**
 * @module typegpu
 */

import { tgpu } from './tgpu';

export { RecursiveDataTypeError } from './errors';
export {
  WgslData,
  AnyWgslData,
  AnyWgslTexelFormat,
} from './types';
export { std } from './std';

export type { WgslBuffer } from './wgslBuffer';

export default tgpu;

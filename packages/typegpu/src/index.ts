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
export type { WgslBuffer } from './wgslBuffer';

export default tgpu;

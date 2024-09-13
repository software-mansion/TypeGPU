/**
 * @module typegpu
 */

import { henlo } from './circ1';
import { henloToo } from './circ2';
import { Storage, Uniform, Vertex, createBuffer } from './tgpuBuffer';
import { read, write } from './tgpuBufferUtils';

export const uberHenlo = {
  one: henlo,
  two: henloToo,
};

export const tgpu = {
  Uniform,
  Storage,
  Vertex,

  createBuffer,
  read,
  write,
};
export default tgpu;

export { RecursiveDataTypeError } from './errors';
export {
  TgpuData,
  AnyTgpuData,
} from './types';
export { std } from './std';
export {
  isUsableAsStorage,
  isUsableAsUniform,
  isUsableAsVertex,
} from './tgpuBuffer';

export type {
  TgpuBuffer,
  Unmanaged,
} from './tgpuBuffer';

import { read, write } from './tgpuBufferUtils';
import { buffer } from './wgslBuffer';

export const tgpu = {
  createBuffer: buffer,
  read,
  write,
};

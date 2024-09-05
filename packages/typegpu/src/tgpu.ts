import { read, write } from './tgpuBufferUtils';
import { fn, procedure } from './tgpuFn';
import { buffer } from './wgslBuffer';

export const tgpu = {
  createBuffer: buffer,
  read,
  write,
  fn,
  procedure,
};

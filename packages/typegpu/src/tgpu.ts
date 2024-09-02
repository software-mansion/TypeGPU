import { read, write } from './tgpuBufferUtils';
import { buffer } from './wgslBuffer';

export default {
  createBuffer: buffer,
  read,
  write,
};

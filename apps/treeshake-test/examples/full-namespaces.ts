// Full namespace imports
import tgpu from 'typegpu';
import * as data from 'typegpu/data';
import * as std from 'typegpu/std';

console.log('Full imports:', {
  tgpu: typeof tgpu,
  data: typeof data,
  std: typeof std,
});

// Use some functionality
const size = data.sizeOf(data.f32);
const fn = tgpu.fn;

console.log('Size:', size, 'Function:', typeof fn);
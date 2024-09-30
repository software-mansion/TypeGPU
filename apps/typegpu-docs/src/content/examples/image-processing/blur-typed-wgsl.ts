import { f32 } from 'typegpu/data';
import tgpu, { createRuntime } from 'typegpu/experimental';

const layout0 = tgpu.bindGroupLayout({
  myUniform: {
    uniform: f32,
  },
  _0: null,
  some: {
    storage: f32,
  },
});

layout0.bound.myUniform;
//            ^?

const root = await createRuntime();

const buffer = root.createBuffer(f32, 0).$usage(tgpu.Uniform);
buffer.write(123.5);

// const group = layout0.populate({
//   myUniform: buffer,
// });

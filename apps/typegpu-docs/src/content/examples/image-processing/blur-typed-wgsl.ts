import { f32 } from 'typegpu/data';
import tgpu, { createRuntime } from 'typegpu/experimental';

const layout0 = tgpu.bindGroupLayout({
  myUniform: { type: 'uniform', data: f32 },
});

layout0.bound.myUniform;
//            ^?

const root = await createRuntime();

const buffer = tgpu.createBuffer(f32, 0).$usage(tgpu.Uniform);
root.writeBuffer(buffer, 123.5);

const group = layout0.populate({
  myUniform: buffer,
});

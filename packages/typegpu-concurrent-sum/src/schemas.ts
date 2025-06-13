import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const inputValueType = d.struct({
  in: d.arrayOf(d.f32, 1024),
})
  .$name('inArray');

export const dataBindGroupLayout = tgpu.bindGroupLayout({
  inputArray: { storage: inputValueType, access: 'mutable' },
});

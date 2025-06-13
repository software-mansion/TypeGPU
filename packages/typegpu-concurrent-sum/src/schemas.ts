import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const fixedArrayLength = 256;
export const inputValueType = d.struct({
  in: d.arrayOf(d.f32, fixedArrayLength),
})
  .$name('inArray');

export const dataBindGroupLayout = tgpu.bindGroupLayout({
  inputArray: { storage: inputValueType, access: 'mutable' },
});

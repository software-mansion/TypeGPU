// Variants of one compute pipeline, differing only in the function plugged into a slot
import { d, tgpu } from 'typegpu';
import { init, precompile } from '@typegpu/prune';
import { add, max, min, mul, noise } from './shared.ts';

const gpu = precompile((root) => {
  const data = root.createMutable(d.arrayOf(d.f32, 64));
  const opSlot = tgpu.slot<(a: number, b: number) => number>();

  const main = tgpu.computeFn({ workgroupSize: [64], in: { gid: d.builtin.globalInvocationId } })((
    input,
  ) => {
    'use gpu';
    const i = input.gid.x;
    const x = d.f32(i) / 64;
    data.$[i] = opSlot.$(noise(x * 8), noise(x * 16 + 3));
  });

  return {
    add: root.with(opSlot, add).createComputePipeline({ compute: main }),
    mul: root.with(opSlot, mul).createComputePipeline({ compute: main }),
    min: root.with(opSlot, min).createComputePipeline({ compute: main }),
    max: root.with(opSlot, max).createComputePipeline({ compute: main }),
  };
})(await init());

for (const variant of [gpu.add, gpu.mul, gpu.min, gpu.max]) {
  variant.dispatchWorkgroups(1);
}

// Two compute pipelines recorded into one compute pass, the way an app batches its dispatches
import { tgpu, d } from 'typegpu';
import { init, precompile } from '@typegpu/prune';

const kernels = precompile((root) => {
  const layout = tgpu.bindGroupLayout({ data: { storage: d.arrayOf(d.f32), access: 'mutable' } });
  const double = tgpu.computeFn({ workgroupSize: [64], in: { id: d.builtin.globalInvocationId } })((
    input,
  ) => {
    'use gpu';
    layout.$.data[input.id.x] = (layout.$.data[input.id.x] as number) * 2;
  });
  const increment = tgpu.computeFn({
    workgroupSize: [64],
    in: { id: d.builtin.globalInvocationId },
  })((input) => {
    'use gpu';
    layout.$.data[input.id.x] = (layout.$.data[input.id.x] as number) + 1;
  });
  const data = root.createBuffer(d.arrayOf(d.f32, 64)).$usage('storage');
  return {
    layout,
    data,
    double: root.createComputePipeline({ compute: double }),
    increment: root.createComputePipeline({ compute: increment }),
  };
});

const root = await init();
const gpu = kernels(root);
const group = root.createBindGroup(gpu.layout, { data: gpu.data });

// Into a pass the app owns
const encoder = root.device.createCommandEncoder();
const pass = encoder.beginComputePass();
gpu.double.with(pass).with(group).dispatchWorkgroups(1);
gpu.increment.with(group).with(pass).dispatchWorkgroups(1);
pass.end();
// Into an encoder the app owns, each dispatch in a pass of its own
gpu.double.with(encoder).with(group).dispatchWorkgroups(1);
root.device.queue.submit([encoder.finish()]);

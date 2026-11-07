// Pipelines created ahead of their first use, with initAsync()
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
  return {
    layout,
    data: root.createBuffer(d.arrayOf(d.f32, 64)).$usage('storage'),
    double: root.createComputePipeline({ compute: double }),
  };
});

const root = await init();
const gpu = kernels(root);
await gpu.double.initAsync();
// A second call shares the first one's creation
await gpu.double.initAsync();
const group = root.createBindGroup(gpu.layout, { data: gpu.data });
gpu.double.with(group).dispatchWorkgroups(1);

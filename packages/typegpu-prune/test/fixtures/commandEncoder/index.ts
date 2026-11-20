// Draws and dispatches batched with root.createCommandEncoder(), as an app written against TypeGPU does
import { common, d, tgpu } from 'typegpu';
import { init, precompile } from '@typegpu/prune';

const gpu = precompile((root) => {
  const layout = tgpu.bindGroupLayout({ data: { storage: d.arrayOf(d.f32), access: 'mutable' } });
  const double = tgpu.computeFn({ workgroupSize: [64], in: { id: d.builtin.globalInvocationId } })((
    input,
  ) => {
    'use gpu';
    layout.$.data[input.id.x] = (layout.$.data[input.id.x] as number) * 2;
  });
  const fragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
    'use gpu';
    return d.vec4f(input.uv, 0, 1);
  });
  return {
    layout,
    data: root.createBuffer(d.arrayOf(d.f32, 64)).$usage('storage'),
    double: root.createComputePipeline({ compute: double }),
    draw: root.createRenderPipeline({ vertex: common.fullScreenTriangle, fragment }),
  };
})(await init());

const root = await init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const group = root.createBindGroup(gpu.layout, { data: gpu.data });

const encoder = root.createCommandEncoder();
const computePass = encoder.beginComputePass();
gpu.double.with(computePass).with(group).dispatchWorkgroups(1);
computePass.end();
// A pass of its own, begun on the encoder
gpu.draw.withColorAttachment({ view: context }).with(encoder).draw(3);
// Into a pass begun on the encoder, its attachment given as a canvas context
const renderPass = encoder.beginRenderPass({ colorAttachments: [{ view: context }] });
gpu.draw.with(renderPass).draw(3);
renderPass.end();
encoder.submit();

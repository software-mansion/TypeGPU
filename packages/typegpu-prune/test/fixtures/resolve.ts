import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { CaptureContext } from '../../src/capture.ts';

export default (root: TgpuRoot, { resolve }: CaptureContext) => {
  const layout = tgpu.bindGroupLayout({ values: { storage: d.arrayOf(d.f32), access: 'mutable' } });

  const halve = tgpu.computeFn({
    workgroupSize: [64],
    in: { gid: d.builtin.globalInvocationId },
  })(({ gid }) => {
    'use gpu';
    const value = layout.$.values[gid.x] as number;
    if (std.extensionEnabled('f16')) {
      layout.$.values[gid.x] = d.f32(d.f16(value) * d.f16(0.5));
    } else {
      layout.$.values[gid.x] = value * 0.5;
    }
  });

  const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
    'use gpu';
    return { pos: d.vec4f(0, 0, 0, 1) };
  });
  const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
    'use gpu';
    return d.vec4f(1);
  });

  const full = root.createComputePipeline({ compute: halve });
  const half = root.createComputePipeline({ compute: halve });
  const draw = root.createRenderPipeline({ vertex, fragment });
  resolve(half, ['shader-f16']);
  resolve(draw);

  return { full, half, draw };
};

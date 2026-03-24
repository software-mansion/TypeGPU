import tgpu, { d, std } from 'typegpu';
import type { TgpuRoot } from 'typegpu';

const WORKGROUP_SIZE = 256;

export const complexVec2ScaleUniformType = d.struct({
  scale: d.f32,
});

export const complexVec2ScaleLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: complexVec2ScaleUniformType },
  src: {
    storage: d.arrayOf(d.vec2f),
    access: 'readonly',
  },
  dst: {
    storage: d.arrayOf(d.vec2f),
    access: 'mutable',
  },
});

const scaleKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  'use gpu';
  const wg = d.u32(WORKGROUP_SIZE);
  const spanX = input.numWorkgroups.x * wg;
  const spanY = input.numWorkgroups.y * spanX;
  const tid = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  const count = std.arrayLength(complexVec2ScaleLayout.$.src);
  if (tid >= count) {
    return;
  }

  const s = complexVec2ScaleLayout.$.uniforms.scale;
  const v = complexVec2ScaleLayout.$.src[tid] as d.v2f;
  complexVec2ScaleLayout.$.dst[tid] = v * s;
});

export function createComplexVec2ScalePipeline(root: TgpuRoot) {
  return root.createComputePipeline({ compute: scaleKernel });
}

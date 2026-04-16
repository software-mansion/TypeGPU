import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';

import tgpu, { d, std } from 'typegpu';

const layout = tgpu.bindGroupLayout({
  output: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

describe('entry function parameter pruning', () => {
  it('prunes subgroup builtins from compute header when subgroups is disabled', () => {
    const mainCompute = tgpu.computeFn({
      in: {
        gid: d.builtin.globalInvocationId,
        sgId: d.builtin.subgroupInvocationId,
        sgSize: d.builtin.subgroupSize,
      },
      workgroupSize: [64],
    })(({ gid, sgId, sgSize }) => {
      if (std.extensionEnabled('subgroups')) {
        layout.$.output[gid.x * sgSize + sgId] = d.f32(1);
      } else {
        layout.$.output[gid.x] = d.f32(1);
      }
    });

    expect(tgpu.resolve([mainCompute])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> output: array<f32>;

      @compute @workgroup_size(64) fn mainCompute(@builtin(global_invocation_id) gid: vec3u) {
        {
          output[gid.x] = 1f;
        }
      }"
    `);

    expect(tgpu.resolve([mainCompute], { enableExtensions: ['subgroups'] })).toMatchInlineSnapshot(`
      "enable subgroups;

      @group(0) @binding(0) var<storage, read_write> output: array<f32>;

      @compute @workgroup_size(64) fn mainCompute(@builtin(global_invocation_id) gid: vec3u, @builtin(subgroup_invocation_id) sgId: u32, @builtin(subgroup_size) sgSize: u32) {
        {
          output[((gid.x * sgSize) + sgId)] = 1f;
        }
      }"
    `);
  });
});

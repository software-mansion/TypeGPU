import { describe, expect, expectTypeOf } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { textureGather } from '../../../src/std/texture.ts';
import tgpu from '../../../src/index.js';
import * as d from '../../../src/data/index.ts';
import { bindGroupLayout } from '../../../src/tgpuBindGroupLayout.ts';
import { resolve } from '../../../src/core/resolve/tgpuResolve.ts';

describe('textureGather', () => {
  it('Has correct signatures', () => {
    const testLayout = bindGroupLayout({
      tex2d: { texture: d.texture2d() },
      tex2d_u32: { texture: d.texture2d(d.u32) },
      tex2d_array: { texture: d.texture2dArray(d.i32) },
      texcube_array: { texture: d.textureCubeArray() },
      texdepth2d: { texture: d.textureDepth2d() },
      texdepth2d_array: { texture: d.textureDepth2dArray() },

      sampler: { sampler: 'non-filtering' },
    });

    expectTypeOf(() => {});

    const testFn = tgpu.fn([])(() => {
      const uv2d = d.vec2f(0.5, 0.5);
      const uv3d = d.vec3f(0.5, 0.5, 0);
      const idx = d.f32(1.2); // f32 to verify proper conversion (implicit in this case)
      const component = d.i32(0);

      const gather2d = textureGather(
        component,
        testLayout.$.tex2d,
        testLayout.$.sampler,
        uv2d,
      );
      const gather2d_u32 = textureGather(
        component,
        testLayout.$.tex2d_u32,
        testLayout.$.sampler,
        uv2d,
      );
      const gather2d_array = textureGather(
        component,
        testLayout.$.tex2d_array,
        testLayout.$.sampler,
        uv2d,
        idx,
      );
      const gathercube_array = textureGather(
        component,
        testLayout.$.texcube_array,
        testLayout.$.sampler,
        uv3d,
        idx,
      );
      const gatherdepth2d = textureGather(
        testLayout.$.texdepth2d,
        testLayout.$.sampler,
        uv2d,
      );
      const gatherdepth2d_array = textureGather(
        testLayout.$.texdepth2d_array,
        testLayout.$.sampler,
        uv2d,
        idx,
      );

      if (false) {
        expectTypeOf(gather2d).toEqualTypeOf<d.v4f>();
        expectTypeOf(gather2d_u32).toEqualTypeOf<d.v4u>();
        expectTypeOf(gather2d_array).toEqualTypeOf<d.v4i>();
        expectTypeOf(gathercube_array).toEqualTypeOf<d.v4f>();
        expectTypeOf(gatherdepth2d).toEqualTypeOf<d.v4f>();
        expectTypeOf(gatherdepth2d_array).toEqualTypeOf<d.v4f>();
      }
    });

    expect(resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var tex2d: texture_2d<f32>;

      @group(0) @binding(6) var sampler_1: sampler;

      @group(0) @binding(1) var tex2d_u32: texture_2d<u32>;

      @group(0) @binding(2) var tex2d_array: texture_2d_array<i32>;

      @group(0) @binding(3) var texcube_array: texture_cube_array<f32>;

      @group(0) @binding(4) var texdepth2d: texture_depth_2d;

      @group(0) @binding(5) var texdepth2d_array: texture_depth_2d_array;

      fn testFn() {
        var uv2d = vec2f(0.5);
        var uv3d = vec3f(0.5, 0.5, 0);
        const idx = 1.2000000476837158f;
        const component = 0i;
        var gather2d = textureGather(component, tex2d, sampler_1, uv2d);
        var gather2d_u32 = textureGather(component, tex2d_u32, sampler_1, uv2d);
        var gather2d_array = textureGather(component, tex2d_array, sampler_1, uv2d, u32(idx));
        var gathercube_array = textureGather(component, texcube_array, sampler_1, uv3d, u32(idx));
        var gatherdepth2d = textureGather(texdepth2d, sampler_1, uv2d);
        var gatherdepth2d_array = textureGather(texdepth2d_array, sampler_1, uv2d, u32(idx));
      }"
    `);
  });
});

import { describe, expect, expectTypeOf } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { textureLoad } from '../../../src/std/texture.ts';
import tgpu from '../../../src/index.js';
import * as d from '../../../src/data/index.ts';
import { bindGroupLayout } from '../../../src/tgpuBindGroupLayout.ts';
import { resolve } from '../../../src/core/resolve/tgpuResolve.ts';

// we need this since all other usages will be removed by plugin
expectTypeOf(() => {});

describe('textureLoad', () => {
  it('Has correct signatures for sampled and depth textures', () => {
    const testLayout = bindGroupLayout({
      tex1d: { texture: d.texture1d() },
      tex2d: { texture: d.texture2d() },
      tex2d_u32: { texture: d.texture2d(d.u32) },
      tex2d_i32: { texture: d.texture2d(d.i32) },
      tex2d_array: { texture: d.texture2dArray() },
      tex3d: { texture: d.texture3d() },
      texms2d: { texture: d.textureMultisampled2d() },
      texdepth2d: { texture: d.textureDepth2d() },
      texdepth2d_array: { texture: d.textureDepth2dArray() },
      texdepthms2d: { texture: d.textureDepthMultisampled2d() },
    });

    const testFn = tgpu.fn([])(() => {
      const coord1d = d.i32(0);
      const coord2d = d.vec2i(0, 0);
      const coord3d = d.vec3i(0, 0, 0);
      const level = d.i32(0);
      const arrayIndex = d.i32(0);
      const sampleIndex = d.i32(0);

      const load1d = textureLoad(testLayout.$.tex1d, coord1d, level);
      const load2d = textureLoad(testLayout.$.tex2d, coord2d, level);
      const load2d_u32 = textureLoad(testLayout.$.tex2d_u32, coord2d, level);
      const load2d_i32 = textureLoad(testLayout.$.tex2d_i32, coord2d, level);
      const load2d_array = textureLoad(testLayout.$.tex2d_array, coord2d, arrayIndex, level);
      const load3d = textureLoad(testLayout.$.tex3d, coord3d, level);
      const loadms2d = textureLoad(testLayout.$.texms2d, coord2d, sampleIndex);
      const loaddepth2d = textureLoad(testLayout.$.texdepth2d, coord2d, level);
      const loaddepth2d_array = textureLoad(
        testLayout.$.texdepth2d_array,
        coord2d,
        arrayIndex,
        level,
      );
      const loaddepthms2d = textureLoad(testLayout.$.texdepthms2d, coord2d, sampleIndex);

      if (false) {
        expectTypeOf(load1d).toEqualTypeOf<d.v4f>();
        expectTypeOf(load2d).toEqualTypeOf<d.v4f>();
        expectTypeOf(load2d_u32).toEqualTypeOf<d.v4u>();
        expectTypeOf(load2d_i32).toEqualTypeOf<d.v4i>();
        expectTypeOf(load2d_array).toEqualTypeOf<d.v4f>();
        expectTypeOf(load3d).toEqualTypeOf<d.v4f>();
        expectTypeOf(loadms2d).toEqualTypeOf<d.v4f>();
        expectTypeOf(loaddepth2d).toEqualTypeOf<number>();
        expectTypeOf(loaddepth2d_array).toEqualTypeOf<number>();
        expectTypeOf(loaddepthms2d).toEqualTypeOf<number>();
      }
    });

    expect(resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var tex1d: texture_1d<f32>;

      @group(0) @binding(1) var tex2d: texture_2d<f32>;

      @group(0) @binding(2) var tex2d_u32: texture_2d<u32>;

      @group(0) @binding(3) var tex2d_i32: texture_2d<i32>;

      @group(0) @binding(4) var tex2d_array: texture_2d_array<f32>;

      @group(0) @binding(5) var tex3d: texture_3d<f32>;

      @group(0) @binding(6) var texms2d: texture_multisampled_2d<f32>;

      @group(0) @binding(7) var texdepth2d: texture_depth_2d;

      @group(0) @binding(8) var texdepth2d_array: texture_depth_2d_array;

      @group(0) @binding(9) var texdepthms2d: texture_depth_multisampled_2d;

      fn testFn() {
        const coord1d = 0i;
        var coord2d = vec2i();
        var coord3d = vec3i();
        const level = 0i;
        const arrayIndex = 0i;
        const sampleIndex = 0i;
        var load1d = textureLoad(tex1d, coord1d, level);
        var load2d = textureLoad(tex2d, coord2d, level);
        var load2d_u32 = textureLoad(tex2d_u32, coord2d, level);
        var load2d_i32 = textureLoad(tex2d_i32, coord2d, level);
        var load2d_array = textureLoad(tex2d_array, coord2d, arrayIndex, level);
        var load3d = textureLoad(tex3d, coord3d, level);
        var loadms2d = textureLoad(texms2d, coord2d, sampleIndex);
        let loaddepth2d = textureLoad(texdepth2d, coord2d, level);
        let loaddepth2d_array = textureLoad(texdepth2d_array, coord2d, arrayIndex, level);
        let loaddepthms2d = textureLoad(texdepthms2d, coord2d, sampleIndex);
      }"
    `);
  });

  it('Has correct signatures for storage textures', () => {
    const testLayout = bindGroupLayout({
      store1d: { storageTexture: d.textureStorage1d('rgba32float', 'read-only') },
      store2d: { storageTexture: d.textureStorage2d('rgba32float', 'read-only') },
      store2d_uint: { storageTexture: d.textureStorage2d('rgba32uint', 'read-only') },
      store2d_sint: { storageTexture: d.textureStorage2d('rgba32sint', 'read-only') },
      store2d_array: { storageTexture: d.textureStorage2dArray('rgba32float', 'read-only') },
      store3d: { storageTexture: d.textureStorage3d('rgba32float', 'read-only') },
    });

    const testFn = tgpu.fn([])(() => {
      const coord1d = d.i32(0);
      const coord2d = d.vec2i(0, 0);
      const coord3d = d.vec3i(0, 0, 0);
      const arrayIndex = d.i32(0);

      const loadStore1d = textureLoad(testLayout.$.store1d, coord1d);
      const loadStore2d = textureLoad(testLayout.$.store2d, coord2d);
      const loadStore2d_uint = textureLoad(testLayout.$.store2d_uint, coord2d);
      const loadStore2d_sint = textureLoad(testLayout.$.store2d_sint, coord2d);
      const loadStore2d_array = textureLoad(testLayout.$.store2d_array, coord2d, arrayIndex);
      const loadStore3d = textureLoad(testLayout.$.store3d, coord3d);

      if (false) {
        expectTypeOf(loadStore1d).toEqualTypeOf<d.v4f>();
        expectTypeOf(loadStore2d).toEqualTypeOf<d.v4f>();
        expectTypeOf(loadStore2d_uint).toEqualTypeOf<d.v4u>();
        expectTypeOf(loadStore2d_sint).toEqualTypeOf<d.v4i>();
        expectTypeOf(loadStore2d_array).toEqualTypeOf<d.v4f>();
        expectTypeOf(loadStore3d).toEqualTypeOf<d.v4f>();
      }
    });

    expect(resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var store1d: texture_storage_1d<rgba32float, read>;

      @group(0) @binding(1) var store2d: texture_storage_2d<rgba32float, read>;

      @group(0) @binding(2) var store2d_uint: texture_storage_2d<rgba32uint, read>;

      @group(0) @binding(3) var store2d_sint: texture_storage_2d<rgba32sint, read>;

      @group(0) @binding(4) var store2d_array: texture_storage_2d_array<rgba32float, read>;

      @group(0) @binding(5) var store3d: texture_storage_3d<rgba32float, read>;

      fn testFn() {
        const coord1d = 0i;
        var coord2d = vec2i();
        var coord3d = vec3i();
        const arrayIndex = 0i;
        var loadStore1d = textureLoad(store1d, coord1d);
        var loadStore2d = textureLoad(store2d, coord2d);
        var loadStore2d_uint = textureLoad(store2d_uint, coord2d);
        var loadStore2d_sint = textureLoad(store2d_sint, coord2d);
        var loadStore2d_array = textureLoad(store2d_array, coord2d, arrayIndex);
        var loadStore3d = textureLoad(store3d, coord3d);
      }"
    `);
  });

  it('Has correct signatures for external textures', () => {
    const testLayout = bindGroupLayout({
      texExternal: { externalTexture: d.textureExternal() },
    });

    const testFn = tgpu.fn([])(() => {
      const coord2d = d.vec2i(0, 0);

      const loadExternal = textureLoad(testLayout.$.texExternal, coord2d);

      if (false) {
        expectTypeOf(loadExternal).toEqualTypeOf<d.v4f>();
      }
    });

    expect(resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var texExternal: texture_external;

      fn testFn() {
        var coord2d = vec2i();
        var loadExternal = textureLoad(texExternal, coord2d);
      }"
    `);
  });

  it('does not allow for raw schemas to be passed in', ({ root }) => {
    const someTexture = root['~unstable']
      .createTexture({
        size: [256, 256],
        format: 'rgba8unorm',
      })
      .$usage('sampled');
    const sampledView = someTexture.createView(d.texture2d());

    const someLayout = bindGroupLayout({
      tex2d: { texture: d.texture2d() },
    });

    // Valid: view from a created texture
    const _validFn = tgpu.fn(
      [],
      d.vec4f,
    )(() => textureLoad(sampledView.$, d.vec2i(0, 0), d.i32(0)));

    // Valid: view from a layout binding
    const _validFn2 = tgpu.fn(
      [],
      d.vec4f,
    )(() => textureLoad(someLayout.$.tex2d, d.vec2i(0, 0), d.i32(0)));

    // @ts-expect-error — raw schema must not be accepted
    const _invalidFn = tgpu.fn(
      [],
      d.vec4f,
    )(() =>
      // @ts-expect-error
      textureLoad(d.texture2d(), d.vec2i(0, 0), 0),
    );
  });
});

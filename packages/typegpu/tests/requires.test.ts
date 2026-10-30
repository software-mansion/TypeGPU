import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('requires directive', () => {
  it('requires readonly_and_readwrite_storage_textures for read-only storage textures', () => {
    const layout = tgpu.bindGroupLayout({
      texture: { storageTexture: d.textureStorage2d('r32float', 'read-only') },
    });

    const fn = () => {
      'use gpu';
      return std.textureLoad(layout.$.texture, d.vec2i());
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "requires readonly_and_readwrite_storage_textures;

      @group(0) @binding(0) var texture: texture_storage_2d<r32float, read>;

      fn fn_1() -> vec4f {
        return textureLoad(texture, vec2i());
      }"
    `);
  });

  it('requires readonly_and_readwrite_storage_textures for read-write storage textures', () => {
    const layout = tgpu.bindGroupLayout({
      texture: { storageTexture: d.textureStorage2d('r32float', 'read-write') },
    });

    const fn = () => {
      'use gpu';
      return std.textureLoad(layout.$.texture, d.vec2i());
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "requires readonly_and_readwrite_storage_textures;

      @group(0) @binding(0) var texture: texture_storage_2d<r32float, read_write>;

      fn fn_1() -> vec4f {
        return textureLoad(texture, vec2i());
      }"
    `);
  });

  it('requires immediate_address_space', () => {
    const level = tgpu['~unstable'].immediateVar(d.u32);

    const fn = () => {
      'use gpu';
      return level.$;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "requires immediate_address_space;

      var<immediate> level: u32;

      fn fn_1() -> u32 {
        return level;
      }"
    `);
  });

  it('requires swizzle_assignment', () => {
    const fn = () => {
      'use gpu';
      const vec = d.vec4f();
      vec.xy = d.vec2f(1, 2);
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "requires swizzle_assignment;

      fn fn_1() {
        var vec = vec4f();
        vec.xy = vec2f(1, 2);
      }"
    `);
  });

  it('combines multiple requires into a single directive', () => {
    const level = tgpu['~unstable'].immediateVar(d.u32);
    const layout = tgpu.bindGroupLayout({
      texture: { storageTexture: d.textureStorage2d('r32uint', 'read-write') },
    });

    const fn = () => {
      'use gpu';
      return std.textureLoad(layout.$.texture, d.vec2i(level.$));
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "requires immediate_address_space, readonly_and_readwrite_storage_textures;

      var<immediate> level: u32;

      @group(0) @binding(0) var texture: texture_storage_2d<r32uint, read_write>;

      fn fn_1() -> vec4u {
        return textureLoad(texture, vec2i(i32(level)));
      }"
    `);
  });

  it('does not clash with extensions', () => {
    const level = tgpu['~unstable'].immediateVar(d.u32);

    const fn = () => {
      'use gpu';
      const x = d.f16();
      return level.$;
    };

    expect(tgpu.resolve([fn], { enableExtensions: ['f16'] })).toMatchInlineSnapshot(`
      "requires immediate_address_space;

      enable f16;

      var<immediate> level: u32;

      fn fn_1() -> u32 {
        const x = 0h;
        return level;
      }"
    `);
  });
});

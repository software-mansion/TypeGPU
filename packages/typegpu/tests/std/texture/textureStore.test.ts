import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('textureStore', () => {
  const layout = tgpu.bindGroupLayout({
    writeOnly: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') },
    readWrite: { storageTexture: d.textureStorage2d('r32float', 'read-write') },
    readOnly: { storageTexture: d.textureStorage2d('rgba8unorm', 'read-only') },
  });

  it('accepts write-only and read-write storage textures', () => {
    const main = () => {
      'use gpu';
      std.textureStore(layout.$.writeOnly, d.vec2u(), d.vec4f(1));
      std.textureStore(layout.$.readWrite, d.vec2i(), d.vec4f(1));
    };

    const wgsl = tgpu.resolve([main]);
    expect(wgsl).toContain('textureStore(writeOnly, vec2u(), vec4f(1));');
    expect(wgsl).toContain('textureStore(readWrite, vec2i(), vec4f(1));');
  });

  it('rejects read-only storage textures', () => {
    const main = () => {
      'use gpu';
      std.textureStore(layout.$.readOnly, d.vec2u(), d.vec4f(1));
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main()
      - fn:textureStore: \`textureStore\` requires a storage texture with 'write-only' or 'read-write' access, got 'read-only'.]
    `);
  });
});

import { wgsl } from 'typegpu';
import { u32 } from 'typegpu/data';
import { describe, expect, it } from 'vitest';

global.GPUTextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
};

describe('texture', () => {
  it('creates a texture with no usage', () => {
    const texture = wgsl.texture({
      size: [1, 1],
      format: 'rgba8unorm',
    });
    // should be null
    expect(
      texture.asSampled({
        dataType: u32,
        type: 'texture_2d',
      }),
    ).toBeNull();
  });
});

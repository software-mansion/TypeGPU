import { wgsl } from 'typegpu';
import { u32 } from 'typegpu/data';
import { describe, expect, it } from 'vitest';
import { StrictNameRegistry } from '../src';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

global.GPUTextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
};

describe('texture', () => {
  it;

  it('creates a texture view', () => {
    const texture = wgsl
      .texture({
        size: [1, 1],
        format: 'rgba8unorm',
      })
      .$name('texture')
      .$allowSampled();

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    const code = wgsl`
      let x = ${texture.asSampled({ type: 'texture_2d', dataType: u32 }).$name('view')};
    `;

    expect(resolutionCtx.resolve(code)).toContain('texture_2d<u32>');
  });
});

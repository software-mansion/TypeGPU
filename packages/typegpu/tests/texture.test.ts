import { wgsl } from 'typegpu';
import { f32, u32 } from 'typegpu/data';
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
  it('creates a sampled texture view with correct type', () => {
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

    let code = wgsl`
      let x = ${texture.asSampled({ type: 'texture_2d', dataType: u32 }).$name('view')};
    `;

    expect(resolutionCtx.resolve(code)).toContain('texture_2d<u32>');

    code = wgsl`
      let x = ${texture.asSampled({ type: 'texture_2d_array', dataType: f32 }).$name('view')};
    `;

    expect(resolutionCtx.resolve(code)).toContain('texture_2d_array<f32>');
  });

  it('creates a storage texture view with correct type', () => {
    const texture = wgsl
      .texture({
        size: [1, 1],
        format: 'rgba8uint',
      })
      .$name('texture')
      .$allowStorage();

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    let code = wgsl`
      let x = ${texture.asStorage({ type: 'texture_storage_2d', access: 'read' }).$name('view')};
    `;

    expect(resolutionCtx.resolve(code)).toContain(
      'texture_storage_2d<rgba8uint, read>',
    );

    code = wgsl`
      let x = ${texture.asStorage({ type: 'texture_storage_2d_array', access: 'write' }).$name('view')};
    `;

    expect(resolutionCtx.resolve(code)).toContain(
      'texture_storage_2d_array<rgba8uint, write>',
    );
  });

  it('reuses views if they have the same descriptor', () => {
    const texture = wgsl
      .texture({
        size: [1, 1],
        format: 'rgba8unorm',
      })
      .$allowSampled();

    const view1 = texture.asSampled({ type: 'texture_2d', dataType: u32 });
    const view2 = texture.asSampled({ dataType: u32, type: 'texture_2d' });

    expect(view1).toBe(view2);
  });

  it('does not resue view if the descriptor is not identical', () => {
    const texture = wgsl
      .texture({
        size: [1, 1],
        format: 'rgba8unorm',
      })
      .$allowSampled();

    const view1 = texture.asSampled({ type: 'texture_2d', dataType: u32 });
    const view2 = texture.asSampled({ dataType: f32, type: 'texture_2d' });

    expect(view1).not.toBe(view2);
  });

  it('produces null when getting view which is not allowed', () => {
    const texture = wgsl
      .texture({
        size: [1, 1],
        format: 'rgba8unorm',
      })
      .$allowStorage();

    const view = texture.asSampled({ type: 'texture_2d', dataType: u32 });

    expect(view).toBeNull();

    const texture2 = wgsl
      .texture({
        size: [1, 1],
        format: 'rgba8unorm',
      })
      .$allowSampled();

    const view2 = texture2.asStorage({
      type: 'texture_storage_2d',
      access: 'read',
    });

    expect(view2).toBeNull();
  });

  it('properly defines external texture', () => {
    const mockHTMLMedaiElement = {
      width: 1,
      height: 1,
    } as HTMLVideoElement;

    const texture = wgsl
      .textureExternal({
        source: mockHTMLMedaiElement,
      })
      .$name('texture');

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    const code = wgsl`
      let x = ${texture};
    `;

    expect(resolutionCtx.resolve(code)).toContain('texture_external');
  });
});

describe('sampler', () => {
  it('creates a sampler with correct type', () => {
    const sampler = wgsl.sampler({}).$name('sampler');

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    const code = wgsl`
      let x = ${sampler};
    `;

    expect(resolutionCtx.resolve(code)).toContain('var sampler: sampler');
  });
});

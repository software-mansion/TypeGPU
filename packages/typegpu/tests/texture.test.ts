import { describe, expect, expectTypeOf } from 'vitest';
import type {
  TgpuMutableTexture,
  TgpuReadonlyTexture,
  TgpuSampledTexture,
  TgpuTexture,
  TgpuWriteonlyTexture,
} from '../src/core/texture/texture.ts';
import type { Render, Sampled } from '../src/core/texture/usageExtension.ts';
import type { F32, I32, U32, Vec4f, Vec4i, Vec4u } from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { StrictNameRegistry } from '../src/nameRegistry.ts';
import { it } from './utils/extendedIt.ts';
import './utils/webgpuGlobals.ts';

describe('TgpuTexture', () => {
  it('makes passing the default, `undefined` or omitting an option prop result in the same type.', ({ root }) => {
    const commonProps = {
      size: [512, 512],
      format: 'rgba8unorm',
    } as const;

    const texture1 = root.createTexture({
      ...commonProps,
    });

    const texture2 = root.createTexture({
      ...commonProps,
      dimension: undefined,
      mipLevelCount: undefined,
      sampleCount: undefined,
      viewFormats: undefined,
    });

    const texture3 = root.createTexture({
      ...commonProps,
      dimension: '2d',
      mipLevelCount: 1,
      sampleCount: 1,
      viewFormats: [],
    });

    expectTypeOf(texture1).toEqualTypeOf(texture2);
    expectTypeOf(texture1).toEqualTypeOf(texture3);
  });

  it('embeds a non-default dimension in the type', ({ root }) => {
    const commonProps = {
      size: [512, 512],
      format: 'rgba8unorm',
    } as const;

    const texture1 = root.createTexture({
      ...commonProps,
      dimension: '3d',
    });

    const texture2 = root.createTexture({
      ...commonProps,
      dimension: '1d',
    });

    expectTypeOf(texture1).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm'; dimension: '3d' }>
    >();
    expectTypeOf(texture2).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm'; dimension: '1d' }>
    >();
  });

  it('embeds a non-default mipLevelCount in the type', ({ root }) => {
    const texture = root.createTexture({
      size: [512, 512],
      format: 'rgba8unorm',
      mipLevelCount: 2,
    });

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm'; mipLevelCount: 2 }>
    >();
  });

  it('embeds a non-default sampleCount in the type', ({ root }) => {
    const texture = root.createTexture({
      size: [512, 512],
      format: 'rgba8unorm',
      sampleCount: 2,
    });

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm'; sampleCount: 2 }>
    >();
  });

  it('embeds non-default viewFormats in the type', ({ root }) => {
    const texture = root.createTexture({
      size: [512, 512],
      format: 'rgba8unorm',
      viewFormats: ['rgba8unorm-srgb', 'rgba8unorm'],
    });

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{
        size: [512, 512];
        format: 'rgba8unorm';
        viewFormats: ('rgba8unorm-srgb' | 'rgba8unorm')[];
      }>
    >();
  });

  it('makes a readonly size tuple mutable in the resulting type', ({ root }) => {
    // This is because there should be no difference between a texture
    // that was created with a readonly size tuple, and one created
    // with a mutable size tuple.

    const texture = root.createTexture({
      size: [1, 2, 3] as const,
      format: 'rgba8unorm',
    });

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [1, 2, 3]; format: 'rgba8unorm' }>
    >();
  });

  it('rejects non-strict or invalid size tuples', ({ root }) => {
    root.createTexture({
      // @ts-expect-error
      size: [],
      format: 'rgba8unorm',
    });

    root.createTexture({
      // @ts-expect-error
      size: [1, 2] as number[], // <- too loose
      format: 'rgba8unorm',
    });
  });

  it('infers `sampled` usage', ({ root }) => {
    const texture = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
      })
      .$usage('sampled');

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm' }> & Sampled
    >();
  });

  it('infers combined usage', ({ root }) => {
    const texture = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
      })
      .$usage('sampled', 'render');

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm' }> & Sampled & Render
    >();
  });

  it('limits available extensions based on the chosen format', ({ root }) => {
    root
      .createTexture({
        format: 'astc-10x10-unorm',
        size: [512, 512],
      })
      // @ts-expect-error
      .$usage('storage');
  });

  it('creates a sampled texture view with correct type', ({ root }) => {
    const texture = root
      .createTexture({
        size: [512, 512, 12],
        format: 'rgba8unorm',
      })
      .$usage('sampled');

    const opts = {
      names: new StrictNameRegistry(),
    };

    const sampled1 = texture.createView('sampled');
    const sampled2 = texture.createView('sampled', { dimension: '2d-array' });

    expect(tgpu.resolve({ externals: { sampled1 } })).toContain(
      'texture_2d<f32>',
    );

    expect(tgpu.resolve({ externals: { sampled2 } })).toContain(
      'texture_2d_array<f32>',
    );
  });

  it('does not allow for creation of view when usage requirement is not met', ({ root }) => {
    const texture = root.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
    });

    // @ts-expect-error
    const getSampled = () => texture.createView('sampled');
    // @ts-expect-error
    const getReadonly = () => texture.createView('readonly');
    // @ts-expect-error
    const getWriteonly = () => texture.createView('writeonly');
    // @ts-expect-error
    const getMutable = () => texture.createView('mutable');

    const texture2 = texture.$usage('sampled');

    const getSampled2 = () => texture2.createView('sampled');
    // @ts-expect-error
    const getReadonly2 = () => texture2.createView('readonly');
    // @ts-expect-error
    const getWriteonly2 = () => texture2.createView('writeonly');
    // @ts-expect-error
    const getMutable2 = () => texture2.createView('mutable');
  });
});

describe('TgpuReadonlyTexture/TgpuWriteonlyTexture/TgpuMutableTexture', () => {
  it('inherits the dimension and format from its owner texture', ({ root }) => {
    const texture1 = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
      })
      .$usage('storage');

    expectTypeOf(texture1.createView('readonly')).toEqualTypeOf<
      TgpuReadonlyTexture<'2d', Vec4f>
    >();

    expectTypeOf(texture1.createView('writeonly')).toEqualTypeOf<
      TgpuWriteonlyTexture<'2d', Vec4f>
    >();

    expectTypeOf(texture1.createView('mutable')).toEqualTypeOf<
      TgpuMutableTexture<'2d', Vec4f>
    >();

    const texture2 = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8uint',
        dimension: '3d',
      })
      .$usage('storage');

    expectTypeOf(texture2.createView('readonly')).toEqualTypeOf<
      TgpuReadonlyTexture<'3d', Vec4u>
    >();

    expectTypeOf(texture2.createView('writeonly')).toEqualTypeOf<
      TgpuWriteonlyTexture<'3d', Vec4u>
    >();

    expectTypeOf(texture2.createView('mutable')).toEqualTypeOf<
      TgpuMutableTexture<'3d', Vec4u>
    >();

    const texture3 = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8sint',
        dimension: '1d',
        viewFormats: ['rgba8unorm'],
      })
      .$usage('storage');

    expectTypeOf(texture3.createView('readonly')).toEqualTypeOf<
      TgpuReadonlyTexture<'1d', Vec4i>
    >();

    expectTypeOf(texture3.createView('writeonly')).toEqualTypeOf<
      TgpuWriteonlyTexture<'1d', Vec4i>
    >();

    expectTypeOf(texture3.createView('mutable')).toEqualTypeOf<
      TgpuMutableTexture<'1d', Vec4i>
    >();
  });

  it('rejects formats different than those specified when defining the texture', ({ root }) => {
    const texture = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
        dimension: '3d',
      })
      .$usage('storage');

    texture.createView('readonly', {
      // @ts-expect-error
      format: 'rgba8snorm',
    });

    texture.createView('writeonly', {
      // @ts-expect-error
      format: 'rg32uint',
    });

    texture.createView('mutable', {
      // @ts-expect-error
      format: 'rgba32float',
    });
  });
});

describe('TgpuSampledTexture', () => {
  it('inherits the dimension and format from its owner texture', ({ root }) => {
    const texture1 = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
      })
      .$usage('sampled');

    expectTypeOf(texture1.createView('sampled')).toEqualTypeOf<
      TgpuSampledTexture<'2d', F32>
    >();

    const texture2 = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8uint',
        dimension: '3d',
      })
      .$usage('sampled');

    expectTypeOf(texture2.createView('sampled')).toEqualTypeOf<
      TgpuSampledTexture<'3d', U32>
    >();

    const texture3 = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8sint',
        dimension: '1d',
        viewFormats: ['rgba8unorm'],
      })
      .$usage('sampled');

    expectTypeOf(texture3.createView('sampled')).toEqualTypeOf<
      TgpuSampledTexture<'1d', I32>
    >();
  });

  it('rejects formats different than those specified when defining the texture', ({ root }) => {
    const texture = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
        dimension: '3d',
      })
      .$usage('sampled');

    texture.createView('sampled', {
      // @ts-expect-error
      format: 'rgba8snorm',
    });
  });
});

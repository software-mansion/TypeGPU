import { describe, expect, expectTypeOf } from 'vitest';
import type {
  TgpuMutableTexture,
  TgpuReadonlyTexture,
  TgpuSampledTexture,
  TgpuTexture,
  TgpuWriteonlyTexture,
} from '../src/core/texture/texture';
import type { Render, Sampled } from '../src/core/texture/usageExtension';
import type { F32, I32, U32, Vec4f, Vec4i, Vec4u } from '../src/data';
import tgpu, { StrictNameRegistry } from '../src/experimental';
import './utils/webgpuGlobals';
import type { NotAllowed } from '../src/extension';
import { it } from './utils/extendedIt';

describe('TgpuTexture', () => {
  it('makes passing the default, `undefined` or omitting an option prop result in the same type.', ({
    root,
  }) => {
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

  it('makes a readonly size tuple mutable in the resulting type', ({
    root,
  }) => {
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
      .$name('texture')
      .$usage('sampled');

    const opts = {
      names: new StrictNameRegistry(),
    };

    const sampled1 = texture.asSampled();
    const sampled2 = texture.asSampled({ dimension: '2d-array' });

    expect(tgpu.resolve({ input: sampled1 })).toContain('texture_2d<f32>');

    expect(tgpu.resolve({ input: sampled2 })).toContain(
      'texture_2d_array<f32>',
    );
  });

  it('produces NotAllowed when getting view which is not allowed', ({
    root,
  }) => {
    const texture = root.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
    });

    const getSampled = () => texture.asSampled();
    const getReadonly = () => texture.asReadonly();
    const getWriteonly = () => texture.asWriteonly();
    const getMutable = () => texture.asMutable();

    expect(getSampled).toThrow();
    expect(getReadonly).toThrow();
    expect(getWriteonly).toThrow();
    expect(getMutable).toThrow();

    expectTypeOf(getSampled).toEqualTypeOf<
      () => NotAllowed<"missing .$usage('sampled')">
    >();

    expectTypeOf(getReadonly).toEqualTypeOf<
      () => NotAllowed<"missing .$usage('storage')">
    >();

    expectTypeOf(getWriteonly).toEqualTypeOf<
      () => NotAllowed<"missing .$usage('storage')">
    >();

    expectTypeOf(getMutable).toEqualTypeOf<
      () => NotAllowed<"missing .$usage('storage')">
    >();
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

    expectTypeOf(texture1.asReadonly()).toEqualTypeOf<
      TgpuReadonlyTexture<'2d', Vec4f>
    >();

    expectTypeOf(texture1.asWriteonly()).toEqualTypeOf<
      TgpuWriteonlyTexture<'2d', Vec4f>
    >();

    expectTypeOf(texture1.asMutable()).toEqualTypeOf<
      TgpuMutableTexture<'2d', Vec4f>
    >();

    const texture2 = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8uint',
        dimension: '3d',
      })
      .$usage('storage');

    expectTypeOf(texture2.asReadonly()).toEqualTypeOf<
      TgpuReadonlyTexture<'3d', Vec4u>
    >();

    expectTypeOf(texture2.asWriteonly()).toEqualTypeOf<
      TgpuWriteonlyTexture<'3d', Vec4u>
    >();

    expectTypeOf(texture2.asMutable()).toEqualTypeOf<
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

    expectTypeOf(texture3.asReadonly()).toEqualTypeOf<
      TgpuReadonlyTexture<'1d', Vec4i>
    >();

    expectTypeOf(texture3.asWriteonly()).toEqualTypeOf<
      TgpuWriteonlyTexture<'1d', Vec4i>
    >();

    expectTypeOf(texture3.asMutable()).toEqualTypeOf<
      TgpuMutableTexture<'1d', Vec4i>
    >();
  });

  it('rejects formats different than those specified when defining the texture', ({
    root,
  }) => {
    const texture = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
        dimension: '3d',
      })
      .$usage('storage');

    texture.asReadonly({
      // @ts-expect-error
      format: 'rgba8snorm',
    });

    texture.asWriteonly({
      // @ts-expect-error
      format: 'rg32uint',
    });

    texture.asMutable({
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

    expectTypeOf(texture1.asSampled()).toEqualTypeOf<
      TgpuSampledTexture<'2d', F32>
    >();

    const texture2 = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8uint',
        dimension: '3d',
      })
      .$usage('sampled');

    expectTypeOf(texture2.asSampled()).toEqualTypeOf<
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

    expectTypeOf(texture3.asSampled()).toEqualTypeOf<
      TgpuSampledTexture<'1d', I32>
    >();
  });

  it('rejects formats different than those specified when defining the texture', ({
    root,
  }) => {
    const texture = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
        dimension: '3d',
      })
      .$usage('sampled');

    texture.asSampled({
      // @ts-expect-error
      format: 'rgba8snorm',
    });
  });
});

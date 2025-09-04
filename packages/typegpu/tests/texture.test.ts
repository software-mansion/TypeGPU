import { describe, expect, expectTypeOf } from 'vitest';
import type {
  TgpuTexture,
  TgpuTextureView,
} from '../src/core/texture/texture.ts';
import type {
  RenderFlag,
  SampledFlag,
} from '../src/core/texture/usageExtension.ts';
import tgpu from '../src/index.ts';
import { StrictNameRegistry } from '../src/nameRegistry.ts';
import { it } from './utils/extendedIt.ts';
import * as d from '../src/data/index.ts';
import './utils/webgpuGlobals.ts';
import { attest } from '@ark/attest';

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
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm' }> & SampledFlag
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
      & TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm' }>
      & SampledFlag
      & RenderFlag
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

    const sampled1 = texture.createView(d.texture2d(d.i32));
    const sampled2 = texture.createView(d.texture2dArray(d.f32));

    expect(tgpu.resolve({ externals: { sampled1 } })).toContain(
      'texture_2d<i32>',
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
    attest(texture.createView(d.texture2d(d.f32)))
      .type.errors.snap(
        `No overload matches this call.Overload 1 of 2, '(args_0: "(Error) Texture not usable as sampled, call $usage('sampled') first"): TgpuTextureView<WgslTexture2d<F32>>', gave the following error.Argument of type 'WgslTexture2d<F32>' is not assignable to parameter of type '"(Error) Texture not usable as sampled, call $usage('sampled') first"'.
Overload 2 of 2, '(schema: "(Error) Texture not usable as sampled, call $usage('sampled') first", viewDescriptor?: (TgpuTextureViewDescriptor & { sampleType?: "float" | "unfilterable-float"; }) | undefined): TgpuTextureView<...>', gave the following error.Argument of type 'WgslTexture2d<F32>' is not assignable to parameter of type '"(Error) Texture not usable as sampled, call $usage('sampled') first"'.`,
      );

    // @ts-expect-error
    attest(texture.createView(d.textureStorage2d('rgba8unorm', 'read-only')))
      .type.errors.snap(
        `No overload matches this call.Overload 1 of 2, '(args_0: "(Error) Texture not usable as sampled, call $usage('sampled') first"): TgpuTextureView<WgslTexture2d<F32>>', gave the following error.Argument of type 'WgslStorageTexture2d<"rgba8unorm", "read-only">' is not assignable to parameter of type '"(Error) Texture not usable as sampled, call $usage('sampled') first"'.
Overload 2 of 2, '(schema: "(Error) Texture not usable as storage, call $usage('storage') first", viewDescriptor?: (TgpuTextureViewDescriptor & { sampleType?: never; }) | undefined): TgpuTextureView<...>', gave the following error.Argument of type 'WgslStorageTexture2d<"rgba8unorm", "read-only">' is not assignable to parameter of type '"(Error) Texture not usable as storage, call $usage('storage') first"'.`,
      );

    const texture2 = texture.$usage('sampled');

    texture2.createView(d.texture2d(d.f32));

    // @ts-expect-error
    attest(texture2.createView(d.textureStorage2d('rgba8unorm', 'read-only')))
      .type.errors.snap(
        'Argument of type \'WgslStorageTexture2d<"rgba8unorm", "read-only">\' is not assignable to parameter of type \'"(Error) Texture not usable as storage, call $usage(\'storage\') first"\'.',
      );
  });

  describe('Texture view', () => {
    it('the default view inherits the dimension and sample type from its owner texture, rejects if not a valid usage', ({ root }) => {
      const texture1 = root
        .createTexture({
          size: [512, 512],
          format: 'rgba8unorm',
        })
        .$usage('sampled');

      expectTypeOf(texture1.createView()).toEqualTypeOf<
        TgpuTextureView<d.WgslTexture2d<d.F32>>
      >();

      const texture2 = root
        .createTexture({
          size: [512, 512],
          format: 'rgba8uint',
          dimension: '3d',
        })
        .$usage('sampled');

      expectTypeOf(texture2.createView()).toEqualTypeOf<
        TgpuTextureView<d.WgslTexture3d<d.U32>>
      >();

      const texture3 = root
        .createTexture({
          size: [512, 512],
          format: 'rgba8sint',
          dimension: '1d',
          viewFormats: ['rgba8unorm'],
        })
        .$usage('sampled');

      expectTypeOf(texture3.createView()).toEqualTypeOf<
        TgpuTextureView<d.WgslTexture1d<d.I32>>
      >();

      const texture4 = root
        .createTexture({
          size: [512, 512],
          format: 'rgba8unorm',
        })
        .$usage('storage');

      // @ts-expect-error
      attest(texture4.createView()).type.errors.snap(
        'Expected 1-2 arguments, but got 0.',
      );
    });
  });
});

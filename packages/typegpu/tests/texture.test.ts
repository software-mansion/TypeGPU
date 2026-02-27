import { describe, expect, expectTypeOf, vi } from 'vitest';
import type {
  TgpuTexture,
  TgpuTextureView,
} from '../src/core/texture/texture.ts';
import type {
  RenderFlag,
  SampledFlag,
} from '../src/core/texture/usageExtension.ts';
import type { ExperimentalTgpuRoot } from '../src/core/root/rootTypes.ts';
import { it } from './utils/extendedIt.ts';
import * as d from '../src/data/index.ts';
// oxlint-disable-next-line import/no-unassigned-import -- imported for side effects
import './utils/webgpuGlobals.ts';
import { attest } from '@ark/attest';
import tgpu from '../src/index.js';
import { getName } from '../src/shared/meta.ts';

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

  it('creates namable views', ({ root }) => {
    const texture = root
      .createTexture({
        size: [512, 512, 12],
        format: 'rgba8unorm',
      })
      .$usage('sampled');

    const sampled1 = texture.createView(d.texture2d(d.i32)).$name('myView');

    expect(getName(sampled1)).toBe('myView');
  });

  it('creates a sampled texture view with correct type', ({ root }) => {
    const texture = root
      .createTexture({
        size: [512, 512, 12],
        format: 'rgba8unorm',
      })
      .$usage('sampled');

    const sampled1 = texture.createView(d.texture2d(d.i32));
    const sampled2 = texture.createView(d.texture2dArray(d.f32));

    expect(tgpu.resolve([sampled1])).toContain('texture_2d<i32>');

    expect(tgpu.resolve([sampled2])).toContain('texture_2d_array<f32>');
  });

  it('does not allow for creation of view when usage requirement is not met', ({ root }) => {
    const texture = root.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
    });

    // @ts-expect-error
    attest(texture.createView(d.texture2d(d.f32)))
      .type.errors.snap(
        "No overload matches this call.The last overload gave the following error.Argument of type 'WgslTexture2d<F32>' is not assignable to parameter of type '\"(Error) Texture not usable as storage, call $usage('storage') first\" | \"(Error) Storage texture format 'rgba8unorm' incompatible with texture format 'rgba8unorm'\" | ... 38 more ... | \"(Error) Storage texture format 'rg11b10ufloat' incompatible with texture format 'rgba8unorm'\"'.",
      );

    // @ts-expect-error
    attest(texture.createView(d.textureStorage2d('rgba8unorm', 'read-only')))
      .type.errors.snap(
        'No overload matches this call.The last overload gave the following error.Argument of type \'WgslStorageTexture2d<"rgba8unorm", "read-only">\' is not assignable to parameter of type \'"(Error) Texture not usable as storage, call $usage(\'storage\') first"\'.',
      );

    const texture2 = texture.$usage('sampled');

    texture2.createView(d.texture2d(d.f32));

    // @ts-expect-error
    attest(texture2.createView(d.textureStorage2d('rgba8unorm', 'read-only')))
      .type.errors.snap(
        `No overload matches this call.Overload 1 of 4, '(schema: "render", viewDescriptor?: TgpuTextureViewDescriptor | undefined): TgpuTextureRenderView', gave the following error.Argument of type 'WgslStorageTexture2d<"rgba8unorm", "read-only">' is not assignable to parameter of type '"render"'.
Overload 2 of 4, '(schema: WgslTexture<WgslTextureProps>, viewDescriptor?: (TgpuTextureViewDescriptor & { sampleType?: never; }) | undefined): TgpuTextureView<...>', gave the following error.Argument of type 'WgslStorageTexture2d<"rgba8unorm", "read-only">' is not assignable to parameter of type 'WgslTexture<WgslTextureProps>'.Type 'WgslStorageTexture2d<"rgba8unorm", "read-only">' is missing the following properties from type 'WgslTexture<WgslTextureProps>': sampleType, multisampled, bindingSampleType
Overload 3 of 4, '(schema: "(Error) Texture not usable as storage, call $usage('storage') first", viewDescriptor?: TgpuTextureViewDescriptor | undefined): TgpuTextureView<...>', gave the following error.Argument of type 'WgslStorageTexture2d<"rgba8unorm", "read-only">' is not assignable to parameter of type '"(Error) Texture not usable as storage, call $usage('storage') first"'.`,
      );
  });

  it('rejects invalid formats for storage texture views', ({ root }) => {
    const texture = root
      .createTexture({
        size: [1, 1],
        format: 'rgba8unorm',
        viewFormats: ['rgba8unorm-srgb'],
      }).$usage('storage');

    // @ts-expect-error
    attest(texture.createView(d.textureStorage2d('rgba8snorm', 'read-only')))
      .type.errors.snap(
        "No overload matches this call.The last overload gave the following error.Argument of type 'WgslStorageTexture2d<\"rgba8snorm\", \"read-only\">' is not assignable to parameter of type '\"(Error) Storage texture format 'rgba8snorm' incompatible with texture format 'rgba8unorm'\"'.",
      );

    // valid
    texture.createView(d.textureStorage2d('rgba8unorm', 'read-only'));

    // not a valid storage format
    attest(
      // @ts-expect-error
      d.textureStorage2d('rgba8unorm-srgb', 'read-only'),
    )
      .type.errors.snap(
        "Argument of type '\"rgba8unorm-srgb\"' is not assignable to parameter of type 'StorageTextureFormats'.",
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
          viewFormats: ['rgba8sint'],
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

    describe('Texture methods', () => {
      it('calls queue.writeTexture when clear is called', ({ root, device }) => {
        const texture = root.createTexture({
          size: [64, 32],
          format: 'rgba8unorm',
          mipLevelCount: 3,
        });

        texture.clear();

        // Should clear all 3 mip levels
        expect(device.mock.queue.writeTexture).toHaveBeenCalledTimes(3);

        // Verify mip level 0: 64x32
        expect(device.mock.queue.writeTexture).toHaveBeenNthCalledWith(
          1,
          { texture: expect.anything(), mipLevel: 0 },
          expect.any(Uint8Array),
          { bytesPerRow: 256, rowsPerImage: 32 }, // 64 * 4 bytes per pixel
          [64, 32, 1],
        );

        // Verify mip level 1: 32x16
        expect(device.mock.queue.writeTexture).toHaveBeenNthCalledWith(
          2,
          { texture: expect.anything(), mipLevel: 1 },
          expect.any(Uint8Array),
          { bytesPerRow: 128, rowsPerImage: 16 }, // 32 * 4 bytes per pixel
          [32, 16, 1],
        );

        // Verify mip level 2: 16x8
        expect(device.mock.queue.writeTexture).toHaveBeenNthCalledWith(
          3,
          { texture: expect.anything(), mipLevel: 2 },
          expect.any(Uint8Array),
          { bytesPerRow: 64, rowsPerImage: 8 }, // 16 * 4 bytes per pixel
          [16, 8, 1],
        );
      });

      it('calls queue.writeTexture for specific mip level when clear is called with mipLevel', ({ root, device }) => {
        const texture = root.createTexture({
          size: [64, 32],
          format: 'rgba8unorm',
          mipLevelCount: 3,
        });

        texture.clear(1);

        expect(device.mock.queue.writeTexture).toHaveBeenCalledTimes(1);
        expect(device.mock.queue.writeTexture).toHaveBeenCalledWith(
          { texture: expect.anything(), mipLevel: 1 },
          expect.any(Uint8Array),
          { bytesPerRow: 128, rowsPerImage: 16 }, // 32 * 4 bytes per pixel for mip 1
          [32, 16, 1],
        );
      });

      it('calls appropriate device methods when generateMipmaps is called', ({ root, device }) => {
        const texture = root.createTexture({
          size: [64, 64],
          format: 'rgba8unorm',
          mipLevelCount: 4,
        }).$usage('render');

        texture.generateMipmaps();

        expect(
          device.mock.createShaderModule.mock.calls.flatMap((call) =>
            call.flatMap((arg) => (arg as { code: string }).code)
          ),
        )
          .toMatchInlineSnapshot(`
            [
              "
            struct VertexOutput {
              @builtin(position) pos: vec4f,
              @location(0) uv: vec2f,
            }

            @vertex
            fn vs_main(@builtin(vertex_index) i: u32) -> VertexOutput {
              const pos = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
              const uv = array(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
              return VertexOutput(vec4f(pos[i], 0, 1), uv[i]);
            }",
              "
            @group(0) @binding(0) var src: texture_2d<f32>;
            @group(0) @binding(1) var samp: sampler;

            @fragment
            fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
              return textureSample(src, samp, uv);
            }",
            ]
          `);

        expect(device.mock.createRenderPipeline).toHaveBeenCalledWith(
          expect.objectContaining({
            vertex: expect.objectContaining({
              module: expect.anything(),
            }),
            fragment: expect.objectContaining({
              module: expect.anything(),
              targets: [{ format: 'rgba8unorm' }],
            }),
            primitive: { topology: 'triangle-list' },
          }),
        );

        expect(device.mock.createSampler).toHaveBeenCalledWith({
          magFilter: 'linear',
          minFilter: 'linear',
        });

        expect(device.mock.createBindGroupLayout).toHaveBeenCalledWith({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.FRAGMENT,
              texture: { sampleType: 'float' },
            },
            {
              binding: 1,
              visibility: GPUShaderStage.FRAGMENT,
              sampler: { type: 'filtering' },
            },
          ],
        });

        expect(device.mock.createCommandEncoder).toHaveBeenCalled();
        expect(device.mock.queue.submit).toHaveBeenCalled();
      });

      it('calls generateMipmaps with specific parameters', ({ root, device }) => {
        const texture = root.createTexture({
          size: [32, 32],
          format: 'rgba8unorm',
          mipLevelCount: 5,
        }).$usage('render');

        texture.generateMipmaps(1, 3); // Start at mip 1, generate 3 levels

        // Should create shader modules for mipmap generation (fresh cache per test)
        expect(device.mock.createRenderPipeline).toHaveBeenCalled();
        expect(device.mock.createCommandEncoder).toHaveBeenCalled();

        // Should call submit for each mip level transition (2 levels: 1->2, 2->3)
        expect(device.mock.queue.submit).toHaveBeenCalled();
      });

      it('caches blit resources appropriately per level', ({ root, device }) => {
        const createTex = (format: GPUTextureFormat) =>
          root.createTexture({ size: [32, 32], format, mipLevelCount: 2 })
            .$usage('render');

        const getCalls = () => ({
          shaderModule: device.mock.createShaderModule.mock.calls.length,
          sampler: device.mock.createSampler.mock.calls.length,
          bindGroupLayout: device.mock.createBindGroupLayout.mock.calls.length,
          pipelineLayout: device.mock.createPipelineLayout.mock.calls.length,
        });

        // First filterable texture
        createTex('rgba8unorm').generateMipmaps();
        expect(getCalls()).toEqual({
          shaderModule: 2,
          sampler: 1,
          bindGroupLayout: 1,
          pipelineLayout: 1,
        });

        // Same format - all cached
        createTex('rgba8unorm').generateMipmaps();
        expect(getCalls()).toEqual({
          shaderModule: 2,
          sampler: 1,
          bindGroupLayout: 1,
          pipelineLayout: 1,
        });

        // Different filterable format - still uses same cache (both filterable floats)
        createTex('rgba16float').generateMipmaps();
        expect(getCalls()).toEqual({
          shaderModule: 2,
          sampler: 1,
          bindGroupLayout: 1,
          pipelineLayout: 1,
        });

        // Unfilterable format - new fragment shader, sampler, and layouts (vertex module reused)
        createTex('r32float').generateMipmaps();
        expect(getCalls()).toEqual({
          shaderModule: 3,
          sampler: 2,
          bindGroupLayout: 2,
          pipelineLayout: 2,
        });
      });

      it('calls queue.writeTexture when write is called with buffer data', ({ root, device }) => {
        const texture = root.createTexture({
          size: [4, 4],
          format: 'rgba8unorm',
        });

        const data = new Uint8Array(64); // 4x4x4 bytes per pixel
        texture.write(data, 0);

        expect(device.mock.queue.writeTexture).toHaveBeenCalledWith(
          expect.objectContaining({
            texture: expect.anything(),
            mipLevel: 0,
          }),
          data.buffer,
          expect.objectContaining({
            bytesPerRow: 16, // 4 pixels * 4 bytes per pixel
            rowsPerImage: 4,
          }),
          [4, 4, 1],
        );
      });

      it('calls write with buffer data for specific mip level', ({ root, device }) => {
        const texture = root.createTexture({
          size: [8, 8],
          format: 'rgba8unorm',
          mipLevelCount: 3,
        });

        const data = new Uint8Array(16); // 2x2x4 bytes for mip level 2
        texture.write(data, 2);

        expect(device.mock.queue.writeTexture).toHaveBeenCalledWith(
          { texture: expect.anything(), mipLevel: 2 },
          data.buffer,
          { bytesPerRow: 8, rowsPerImage: 2 }, // 2 pixels * 4 bytes per pixel
          [2, 2, 1], // Mip level 2 dimensions
        );
      });

      it('calls queue.copyExternalImageToTexture when write is called with image source', ({ root, device }) => {
        const texture = root.createTexture({
          size: [32, 32],
          format: 'rgba8unorm',
        });

        const mockImage = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        texture.write(mockImage);

        expect(device.mock.queue.copyExternalImageToTexture)
          .toHaveBeenCalledWith(
            { source: mockImage },
            expect.objectContaining({
              texture: expect.anything(),
            }),
            [32, 32],
          );
      });

      it('handles resizing when image dimensions do not match texture', ({ root, device }) => {
        const texture = root.createTexture({
          size: [64, 64],
          format: 'rgba8unorm',
        });

        const mockImage = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        texture.write(mockImage);

        // Should create textures for resampling since image size doesn't match texture size
        expect(device.mock.createTexture).toHaveBeenCalled();
        expect(device.mock.createShaderModule).toHaveBeenCalled();
        expect(device.mock.createRenderPipeline).toHaveBeenCalled();

        // Verify that command encoder and render pass are used for resampling
        expect(device.mock.createCommandEncoder).toHaveBeenCalled();
        expect(device.mock.queue.submit).toHaveBeenCalled();
      });

      it('calls device methods when copyFrom is called', ({ root, device }) => {
        const sourceTexture = root.createTexture({
          size: [16, 16],
          format: 'rgba8unorm',
        });

        const targetTexture = root.createTexture({
          size: [16, 16],
          format: 'rgba8unorm',
        });

        targetTexture.copyFrom(sourceTexture);

        expect(device.mock.createCommandEncoder).toHaveBeenCalledTimes(1);
        expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);

        const commandEncoder = device.mock.createCommandEncoder.mock
          .results[device.mock.createCommandEncoder.mock.results.length - 1]
          ?.value;
        expect(commandEncoder?.copyTextureToTexture).toHaveBeenCalledWith(
          { texture: expect.anything() },
          { texture: expect.anything() },
          [16, 16],
        );

        expect(commandEncoder?.finish).toHaveBeenCalledTimes(1);
        expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);
      });

      it('throws error when copyFrom is called with mismatched format', ({ root }) => {
        const sourceTexture = root.createTexture({
          size: [16, 16],
          format: 'rgba8unorm',
        });

        const targetTexture = root.createTexture({
          size: [16, 16],
          format: 'rgba8sint',
        });

        // @ts-expect-error - Testing format mismatch error
        expect(() => targetTexture.copyFrom(sourceTexture)).toThrow(
          'Texture format mismatch',
        );
      });

      it('throws error when copyFrom is called with mismatched size', ({ root }) => {
        const sourceTexture = root.createTexture({
          size: [16, 16],
          format: 'rgba8unorm',
        });

        const targetTexture = root.createTexture({
          size: [32, 32],
          format: 'rgba8unorm',
        });

        // @ts-expect-error - Testing size mismatch error
        expect(() => targetTexture.copyFrom(sourceTexture)).toThrow(
          'Texture size mismatch',
        );
      });

      it('throws error when write is called with incorrect buffer size', ({ root }) => {
        const texture = root.createTexture({
          size: [4, 4],
          format: 'rgba8unorm',
        });

        const incorrectData = new Uint8Array(32); // Should be 64 bytes for 4x4x4

        expect(() => texture.write(incorrectData)).toThrow(
          'Buffer size mismatch',
        );
      });

      it('warns and returns early when generateMipmaps would generate no mipmaps', ({ root }) => {
        const texture = root.createTexture({
          size: [32, 32],
          format: 'rgba8unorm',
          mipLevelCount: 3,
        }).$usage('render');

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(
          () => {},
        );

        // Base mip level 3 would result in 0 mip levels to generate, so it should return early
        expect(() => texture.generateMipmaps(3)).not.toThrow();

        expect(consoleSpy).toHaveBeenCalledWith(
          'generateMipmaps is a no-op: would generate 0 mip levels (base: 3, total: 3)',
        );

        consoleSpy.mockRestore();
      });

      it('warns when generateMipmaps would generate only 1 mip level', ({ root }) => {
        const texture = root.createTexture({
          size: [32, 32],
          format: 'rgba8unorm',
          mipLevelCount: 3,
        }).$usage('render');

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(
          () => {},
        );

        // Base mip level 2 would result in 1 mip level to generate (3-2=1), so it should warn and return early
        expect(() => texture.generateMipmaps(2)).not.toThrow();

        expect(consoleSpy).toHaveBeenCalledWith(
          'generateMipmaps is a no-op: would generate 1 mip levels (base: 2, total: 3)',
        );

        consoleSpy.mockRestore();
      });

      it('throws an error and warns on the type level when the required render usage is missing', ({ root }) => {
        const texture = root.createTexture({
          size: [32, 32],
          format: 'rgba8unorm',
          mipLevelCount: 3,
        });

        // TODO: Maybe figure out a way to make this a type level error again?
        // expectTypeOf(texture.generateMipmaps).toExtend<
        //   (
        //     missingUsage:
        //       "(Error) generateMipmaps requires the texture to be usable as a render target. Use .$usage('render') first.",
        //   ) => void
        // >;

        expect(() => texture.generateMipmaps())
          .toThrowErrorMatchingInlineSnapshot(
            `[Error: generateMipmaps called without specifying 'render' usage. Add it via the $usage('render') method.]`,
          );
      });
    });
  });

  describe('Attachment usage', () => {
    const vertexFn = tgpu.vertexFn({
      out: { pos: d.builtin.position, uv: d.vec2f },
    })(() => {
      return { pos: d.vec4f(0, 0, 0, 1), uv: d.vec2f() };
    });

    const fragmentFn = tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f,
    })(({ uv }) => {
      return d.vec4f(uv, 0, 1);
    });

    const createRenderPipeline = (root: ExperimentalTgpuRoot) =>
      root
        .withVertex(vertexFn)
        .withFragment(fragmentFn, { format: 'rgba8unorm' })
        .createPipeline();

    it('works correctly when using either a texture or its view as a render target', ({ root }) => {
      const texture = root
        .createTexture({
          size: [128, 128],
          format: 'rgba8unorm',
          mipLevelCount: 6,
        })
        .$usage('render');

      const textureView = texture.createView('render', {
        mipLevelCount: 1,
        baseMipLevel: 2,
      });

      createRenderPipeline(root)
        .withColorAttachment({
          view: texture,
          loadOp: 'clear',
          storeOp: 'store',
        })
        .withColorAttachment({
          view: textureView,
          loadOp: 'clear',
          storeOp: 'store',
        });
    });

    it('works correctly when using either a texture or its view as a depth-stencil attachment', ({ root }) => {
      const texture = root
        .createTexture({
          size: [128, 128],
          format: 'depth24plus-stencil8',
        })
        .$usage('render');

      const textureView = texture.createView('render', {
        mipLevelCount: 1,
        baseMipLevel: 0,
      });

      createRenderPipeline(root)
        .withDepthStencilAttachment({ view: texture })
        .withDepthStencilAttachment({ view: textureView });
    });

    it('rejects non-depth formats for depth-stencil attachment views', ({ root }) => {
      const texture = root
        .createTexture({
          size: [128, 128],
          format: 'rgba8unorm',
        })
        .$usage('render');

      (() => {
        createRenderPipeline(root).withDepthStencilAttachment({
          // @ts-expect-error
          view: texture,
        });
      });
    });

    it('rejects storage views for color attachments', ({ root }) => {
      const texture = root
        .createTexture({
          size: [128, 128],
          format: 'rgba8unorm',
        })
        .$usage('storage');

      const textureView = texture.createView(
        d.textureStorage2d('rgba8unorm', 'read-write'),
      );

      (() => {
        createRenderPipeline(root).withColorAttachment({
          // @ts-expect-error
          view: textureView,
          loadOp: 'clear',
          storeOp: 'store',
        });
      });
    });
  });
});

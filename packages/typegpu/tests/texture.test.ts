import { describe, expect, expectTypeOf, type MockInstance, vi } from 'vitest';
import type {
  RenderFlag,
  SampledFlag,
  StorageFlag,
  TgpuRoot,
  TgpuTexture,
  TgpuTextureView,
} from 'typegpu';
import {
  it,
  type MockCommandEncoder,
  type MockDevice,
  type MockRenderPassEncoder,
} from 'typegpu-testing-utility';
import { attest } from '@ark/attest';
import { tgpu, d, common } from 'typegpu';

/** Flattens GPU mock activity into a chronological list of labeled calls */
function gpuCallTimeline(fixtures: {
  device: MockDevice;
  commandEncoder: MockCommandEncoder;
  renderPassEncoder: MockRenderPassEncoder;
}): string[] {
  const events: [order: number, label: string][] = [];
  const record = (fn: MockInstance, label: (args: unknown[]) => string) => {
    fn.mock.invocationCallOrder.forEach((order, i) => {
      events.push([order, label(fn.mock.calls[i] ?? [])]);
    });
  };

  const { device, commandEncoder, renderPassEncoder } = fixtures;
  record(device.mock.createTexture, (args) => {
    const size = (args[0] as GPUTextureDescriptor).size;
    const [width, height] = 'width' in size ? [size.width, size.height] : [...size];
    return `createTexture(${width}x${height})`;
  });
  record(device.mock.queue.copyExternalImageToTexture, () => 'copyExternalImageToTexture');
  record(device.mock.createRenderPipeline, () => 'createRenderPipeline');
  record(device.mock.createBindGroup, () => 'createBindGroup');
  record(device.mock.createCommandEncoder, () => 'createCommandEncoder');
  record(commandEncoder.mock.beginRenderPass, (args) => {
    const [attachment] = (args[0] as { colorAttachments: GPURenderPassColorAttachment[] })
      .colorAttachments;
    return `beginRenderPass(${attachment?.loadOp})`;
  });
  record(
    renderPassEncoder.mock.setViewport,
    (args) => `setViewport(${args.slice(0, 4).join(', ')})`,
  );
  record(renderPassEncoder.mock.draw, () => 'draw');
  record(device.mock.queue.submit, () => 'submit');
  for (const { value: texture } of device.mock.createTexture.mock.results) {
    if (texture) {
      record(texture.destroy, () => `destroyTexture(${texture.width}x${texture.height})`);
    }
  }

  return events.toSorted(([a], [b]) => a - b).map(([, label]) => label);
}

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

  it('makes a readonly size tuple mutable in the resulting type', ({ root }) => {
    // This is because there should be no difference between a texture
    // that was created with a readonly size tuple, and one created
    // with a mutable size tuple.

    const texture = root.createTexture({
      size: [1, 2, 3] as const,
      format: 'rgba8unorm',
    });

    expectTypeOf(texture).toEqualTypeOf<TgpuTexture<{ size: [1, 2, 3]; format: 'rgba8unorm' }>>();
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
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm' }> & SampledFlag & RenderFlag
    >();
  });

  it('creates transient textures with the exact WebGPU usage bits', ({ root, device }) => {
    const texture = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
      })
      .$usage('transient');

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm' }> & RenderFlag
    >();

    root.unwrap(texture);

    expect(device.mock.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: GPUTextureUsage.TRANSIENT_ATTACHMENT | GPUTextureUsage.RENDER_ATTACHMENT,
      }),
    );
  });

  it('rejects combining transient texture usage with sampled usage', ({ root }) => {
    expect(() =>
      root
        .createTexture({
          size: [512, 512],
          format: 'rgba8unorm',
        })
        .$usage('transient', 'sampled'),
    ).toThrow("Transient texture usage cannot be combined with 'sampled' or 'storage'.");
  });

  it('overrides raw WebGPU usage flags exactly', ({ root, device }) => {
    const texture = root
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
      })
      .$overrideFlags(GPUTextureUsage.RENDER_ATTACHMENT);

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm' }> &
        SampledFlag &
        StorageFlag &
        RenderFlag
    >();

    root.unwrap(texture);

    expect(texture).toMatchObject({
      usableAsSampled: true,
      usableAsStorage: true,
      usableAsRender: true,
    });
    expect(() => texture.$usage('transient')).toThrow(
      'Cannot call $usage() after $overrideFlags().',
    );
    expect(device.mock.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      }),
    );
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

    expect(root.unwrap(sampled1).label).toBe('myView');
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
    attest(texture.createView(d.texture2d(d.f32))).type.errors.snap(
      "No overload matches this call.The last overload gave the following error.Argument of type 'WgslTexture2d<F32>' is not assignable to parameter of type '\"(Error) Texture not usable as storage, call $usage('storage') first\" | \"(Error) Storage texture format 'rgba8unorm' incompatible with texture format 'rgba8unorm'\" | ... 38 more ... | \"(Error) Storage texture format 'rg11b10ufloat' incompatible with texture format 'rgba8unorm'\"'.",
    );

    // @ts-expect-error
    attest(texture.createView(d.textureStorage2d('rgba8unorm', 'read-only'))).type.errors.snap(
      'No overload matches this call.The last overload gave the following error.Argument of type \'WgslStorageTexture2d<"rgba8unorm", "read-only">\' is not assignable to parameter of type \'"(Error) Texture not usable as storage, call $usage(\'storage\') first"\'.',
    );

    const texture2 = texture.$usage('sampled');

    texture2.createView(d.texture2d(d.f32));

    // @ts-expect-error
    attest(texture2.createView(d.textureStorage2d('rgba8unorm', 'read-only'))).type.errors.snap(
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
      })
      .$usage('storage');

    // @ts-expect-error
    attest(texture.createView(d.textureStorage2d('rgba8snorm', 'read-only'))).type.errors.snap(
      "No overload matches this call.The last overload gave the following error.Argument of type 'WgslStorageTexture2d<\"rgba8snorm\", \"read-only\">' is not assignable to parameter of type '\"(Error) Storage texture format 'rgba8snorm' incompatible with texture format 'rgba8unorm'\"'.",
    );

    // valid
    texture.createView(d.textureStorage2d('rgba8unorm', 'read-only'));

    // not a valid storage format
    attest(
      // @ts-expect-error
      d.textureStorage2d('rgba8unorm-srgb', 'read-only'),
    ).type.errors.snap(
      "Argument of type '\"rgba8unorm-srgb\"' is not assignable to parameter of type 'StorageTextureFormats'.",
    );
  });

  describe('Texture view', () => {
    it('the default view inherits the dimension and sample type from its owner texture, rejects if not a valid usage', ({
      root,
    }) => {
      const texture1 = root
        .createTexture({
          size: [512, 512],
          format: 'rgba8unorm',
        })
        .$usage('sampled');

      expectTypeOf(texture1.createView()).toEqualTypeOf<TgpuTextureView<d.WgslTexture2d<d.F32>>>();

      const texture2 = root
        .createTexture({
          size: [512, 512],
          format: 'rgba8uint',
          dimension: '3d',
        })
        .$usage('sampled');

      expectTypeOf(texture2.createView()).toEqualTypeOf<TgpuTextureView<d.WgslTexture3d<d.U32>>>();

      const texture3 = root
        .createTexture({
          size: [512, 512],
          format: 'rgba8sint',
          dimension: '1d',
          viewFormats: ['rgba8sint'],
        })
        .$usage('sampled');

      expectTypeOf(texture3.createView()).toEqualTypeOf<TgpuTextureView<d.WgslTexture1d<d.I32>>>();

      const texture4 = root
        .createTexture({
          size: [512, 512],
          format: 'rgba8unorm',
        })
        .$usage('storage');

      // @ts-expect-error
      attest(texture4.createView()).type.errors.snap('Expected 1-2 arguments, but got 0.');
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

      it('calls queue.writeTexture for specific mip level when clear is called with mipLevel', ({
        root,
        device,
      }) => {
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

      it('calls appropriate device methods when generateMipmaps is called', ({
        root,
        device,
        commandEncoder,
        renderPassEncoder,
      }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
            mipLevelCount: 4,
          })
          .$usage('render');

        texture.generateMipmaps();

        expect(
          device.mock.createShaderModule.mock.calls.flatMap((call) =>
            call.flatMap((arg) => (arg as { code: string }).code),
          ),
        ).toMatchInlineSnapshot(`
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

        expect(gpuCallTimeline({ device, commandEncoder, renderPassEncoder }))
          .toMatchInlineSnapshot(`
          [
            "createTexture(64x64)",
            "createCommandEncoder",
            "createRenderPipeline",
            "createBindGroup",
            "beginRenderPass(clear)",
            "draw",
            "createBindGroup",
            "beginRenderPass(clear)",
            "draw",
            "createBindGroup",
            "beginRenderPass(clear)",
            "draw",
            "submit",
          ]
        `);
      });

      it('blits only the requested mip range when generateMipmaps is called with parameters', ({
        root,
        device,
      }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
            mipLevelCount: 5,
          })
          .$usage('render');

        texture.generateMipmaps(1, 3); // Start at mip 1, generate 3 levels

        const [target] = device.mock.createTexture.mock.results;
        expect(target?.value.createView.mock.calls).toMatchInlineSnapshot(`
          [
            [
              {
                "arrayLayerCount": 1,
                "baseArrayLayer": 0,
                "baseMipLevel": 1,
                "dimension": "2d",
                "mipLevelCount": 1,
              },
            ],
            [
              {
                "arrayLayerCount": 1,
                "baseArrayLayer": 0,
                "baseMipLevel": 2,
                "dimension": "2d",
                "mipLevelCount": 1,
              },
            ],
            [
              {
                "arrayLayerCount": 1,
                "baseArrayLayer": 0,
                "baseMipLevel": 2,
                "dimension": "2d",
                "mipLevelCount": 1,
              },
            ],
            [
              {
                "arrayLayerCount": 1,
                "baseArrayLayer": 0,
                "baseMipLevel": 3,
                "dimension": "2d",
                "mipLevelCount": 1,
              },
            ],
          ]
        `);
      });

      it('caches blit resources appropriately per level', ({ root, device }) => {
        const createTex = (format: GPUTextureFormat) =>
          root.createTexture({ size: [32, 32], format, mipLevelCount: 2 }).$usage('render');

        const getCalls = () => ({
          shaderModule: device.mock.createShaderModule.mock.calls.length,
          sampler: device.mock.createSampler.mock.calls.length,
          bindGroupLayout: device.mock.createBindGroupLayout.mock.calls.length,
          pipelineLayout: device.mock.createPipelineLayout.mock.calls.length,
          renderPipeline: device.mock.createRenderPipeline.mock.calls.length,
        });

        // First filterable texture
        createTex('rgba8unorm').generateMipmaps();
        expect(getCalls()).toMatchInlineSnapshot(`
          {
            "bindGroupLayout": 1,
            "pipelineLayout": 1,
            "renderPipeline": 1,
            "sampler": 1,
            "shaderModule": 2,
          }
        `);

        // Same format - all cached
        createTex('rgba8unorm').generateMipmaps();
        expect(getCalls()).toMatchInlineSnapshot(`
          {
            "bindGroupLayout": 1,
            "pipelineLayout": 1,
            "renderPipeline": 1,
            "sampler": 1,
            "shaderModule": 2,
          }
        `);

        // Different filterable format - same modules and layouts, new pipeline per format
        createTex('rgba16float').generateMipmaps();
        expect(getCalls()).toMatchInlineSnapshot(`
          {
            "bindGroupLayout": 1,
            "pipelineLayout": 1,
            "renderPipeline": 2,
            "sampler": 1,
            "shaderModule": 2,
          }
        `);

        // Unfilterable format - new fragment shader, sampler, layouts and pipeline (vertex module reused)
        createTex('r32float').generateMipmaps();
        expect(getCalls()).toMatchInlineSnapshot(`
          {
            "bindGroupLayout": 2,
            "pipelineLayout": 2,
            "renderPipeline": 3,
            "sampler": 2,
            "shaderModule": 3,
          }
        `);
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
          data,
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
          { texture: expect.anything(), mipLevel: 2, origin: { x: 0, y: 0, z: 0 } },
          data,
          { bytesPerRow: 8, rowsPerImage: 2 }, // 2 pixels * 4 bytes per pixel
          [2, 2, 1], // Mip level 2 dimensions
        );
      });

      it('writes buffer data to a region', ({ root, device }) => {
        const texture = root.createTexture({
          size: [16, 16],
          format: 'rgba8unorm',
        });

        const data = new Uint8Array(4 * 5 * 4);
        texture.write(data, { origin: [2, 3], size: [4, 5] });

        expect(device.mock.queue.writeTexture).toHaveBeenCalledWith(
          { texture: expect.anything(), mipLevel: 0, origin: { x: 2, y: 3, z: 0 } },
          data,
          { bytesPerRow: 16, rowsPerImage: 5 },
          [4, 5, 1],
        );
      });

      it('calls queue.copyExternalImageToTexture when write is called with image source', ({
        root,
        device,
      }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const mockImage = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        texture.write(mockImage);

        expect(device.mock.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
          { source: mockImage },
          {
            texture: expect.anything(),
            mipLevel: 0,
            origin: { x: 0, y: 0, z: 0 },
          },
          { width: 32, height: 32, depthOrArrayLayers: 1 },
        );
      });

      it('throws a clear error when image source writes are missing render usage', ({ root }) => {
        const mockImage = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        expect(() =>
          root
            .createTexture({
              size: [32, 32],
              format: 'rgba8unorm',
            })
            .write(mockImage),
        ).toThrowErrorMatchingInlineSnapshot(
          `[Error: texture.write(...) with image sources requires 'render' usage. Add it via the $usage('render') method.]`,
        );

        expect(() =>
          common.writeChannels(
            root.createTexture({ size: [32, 32], format: 'rgba8unorm' }) as TgpuTexture &
              RenderFlag,
            {
              r: { source: mockImage, from: 'r' },
            },
          ),
        ).toThrowErrorMatchingInlineSnapshot(
          `[Error: writeChannels requires 'render' usage. Add it via the $usage('render') method.]`,
        );
      });

      it('throws when image dimensions do not match texture without a fit mode', ({ root }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const mockImage = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        expect(() => texture.write(mockImage)).toThrowErrorMatchingInlineSnapshot(
          `[Error: Texture write source size 32x32 does not match target size 64x64. Pass fit: 'stretch' to scale the source or fit: 'clip' to copy the overlapping region.]`,
        );
      });

      it('handles resizing when image dimensions do not match texture with fit: stretch', ({
        root,
        device,
        commandEncoder,
        renderPassEncoder,
      }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const mockImage = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        texture.write(mockImage, { fit: 'stretch' });

        expect(gpuCallTimeline({ device, commandEncoder, renderPassEncoder }))
          .toMatchInlineSnapshot(`
          [
            "createTexture(64x64)",
            "createTexture(32x32)",
            "copyExternalImageToTexture",
            "createRenderPipeline",
            "createBindGroup",
            "createCommandEncoder",
            "beginRenderPass(clear)",
            "setViewport(0, 0, 64, 64)",
            "draw",
            "submit",
            "destroyTexture(32x32)",
          ]
        `);
      });

      it('resamples each layer of an image array in its own submit with one staging texture alive at a time', ({
        root,
        device,
        commandEncoder,
        renderPassEncoder,
      }) => {
        const texture = root
          .createTexture({
            size: [64, 64, 2],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const mockImage = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        texture.write([mockImage, mockImage], { fit: 'stretch' });

        expect(gpuCallTimeline({ device, commandEncoder, renderPassEncoder }))
          .toMatchInlineSnapshot(`
          [
            "createTexture(64x64)",
            "createTexture(32x32)",
            "copyExternalImageToTexture",
            "createRenderPipeline",
            "createBindGroup",
            "createCommandEncoder",
            "beginRenderPass(clear)",
            "setViewport(0, 0, 64, 64)",
            "draw",
            "submit",
            "destroyTexture(32x32)",
            "createTexture(32x32)",
            "copyExternalImageToTexture",
            "createBindGroup",
            "createCommandEncoder",
            "beginRenderPass(clear)",
            "setViewport(0, 0, 64, 64)",
            "draw",
            "submit",
            "destroyTexture(32x32)",
          ]
        `);
      });

      it('throws when passing a Blob to synchronous write', ({ root }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
          })
          .$usage('render');

        expect(() =>
          texture.write(new Blob(['image']) as never),
        ).toThrowErrorMatchingInlineSnapshot(
          `[Error: Blob sources are only supported in texture.writeAsync(...).]`,
        );
      });

      it('passes premultipliedAlpha and colorSpace through to the copy', ({ root, device }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const mockImage = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        texture.write(mockImage, {
          premultipliedAlpha: true,
          colorSpace: 'display-p3',
        });

        expect(device.mock.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
          { source: mockImage },
          {
            texture: expect.anything(),
            mipLevel: 0,
            origin: { x: 0, y: 0, z: 0 },
            premultipliedAlpha: true,
            colorSpace: 'display-p3',
          },
          { width: 32, height: 32, depthOrArrayLayers: 1 },
        );
      });

      it('writes image descriptors with destination origin, size and mip level', ({
        root,
        device,
      }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
            mipLevelCount: 2,
          })
          .$usage('render');

        const mockImage = {
          width: 8,
          height: 9,
        } as HTMLImageElement;

        texture.write(mockImage, {
          origin: [4, 5],
          size: [8, 9],
          mipLevel: 1,
        });

        expect(device.mock.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
          { source: mockImage },
          {
            texture: expect.anything(),
            mipLevel: 1,
            origin: { x: 4, y: 5, z: 0 },
          },
          { width: 8, height: 9, depthOrArrayLayers: 1 },
        );
      });

      it('passes source crop options when writing image descriptors', ({ root, device }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const mockImage = {
          width: 16,
          height: 16,
        } as HTMLImageElement;

        texture.write(mockImage, {
          sourceOrigin: [2, 3],
          sourceSize: [4, 5],
          size: [4, 5],
          origin: [6, 7],
        });

        expect(device.mock.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
          { source: mockImage, origin: { x: 2, y: 3 } },
          {
            texture: expect.anything(),
            mipLevel: 0,
            origin: { x: 6, y: 7, z: 0 },
          },
          { width: 4, height: 5, depthOrArrayLayers: 1 },
        );
      });

      it('defaults the write size to the mip level size', ({ root, device }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
            mipLevelCount: 2,
          })
          .$usage('render');

        const mip1SizedImage = { width: 32, height: 32 } as HTMLImageElement;

        texture.write(mip1SizedImage, { mipLevel: 1 });

        expect(device.mock.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
          { source: mip1SizedImage },
          {
            texture: expect.anything(),
            mipLevel: 1,
            origin: { x: 0, y: 0, z: 0 },
          },
          { width: 32, height: 32, depthOrArrayLayers: 1 },
        );
      });

      it('clips an oversized source to the target region with fit: clip', ({ root, device }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const mockImage = { width: 100, height: 80 } as HTMLImageElement;

        texture.write(mockImage, { fit: 'clip' });

        expect(device.mock.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
          { source: mockImage },
          {
            texture: expect.anything(),
            mipLevel: 0,
            origin: { x: 0, y: 0, z: 0 },
          },
          { width: 64, height: 64, depthOrArrayLayers: 1 },
        );
        expect(device.mock.createRenderPipeline).not.toHaveBeenCalled();
      });

      it('writes a patch at an origin with fit: clip', ({ root, device }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const tile = { width: 8, height: 8 } as HTMLImageElement;

        texture.write(tile, { origin: [4, 5], fit: 'clip' });

        expect(device.mock.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
          { source: tile },
          {
            texture: expect.anything(),
            mipLevel: 0,
            origin: { x: 4, y: 5, z: 0 },
          },
          { width: 8, height: 8, depthOrArrayLayers: 1 },
        );
        expect(device.mock.createRenderPipeline).not.toHaveBeenCalled();
      });

      it('uses the render path when image descriptor size resamples the source', ({
        root,
        device,
        commandEncoder,
        renderPassEncoder,
      }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const mockImage = {
          width: 16,
          height: 16,
        } as HTMLImageElement;

        texture.write(mockImage, {
          size: [32, 32],
          fit: 'stretch',
        });

        expect(gpuCallTimeline({ device, commandEncoder, renderPassEncoder }))
          .toMatchInlineSnapshot(`
          [
            "createTexture(64x64)",
            "createTexture(16x16)",
            "copyExternalImageToTexture",
            "createRenderPipeline",
            "createBindGroup",
            "createCommandEncoder",
            "beginRenderPass(load)",
            "setViewport(0, 0, 32, 32)",
            "draw",
            "submit",
            "destroyTexture(16x16)",
          ]
        `);
      });

      it('keeps sRGB image writes in sRGB when resampling', ({ root, device }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm-srgb',
          })
          .$usage('render');

        const mockImage = {
          width: 16,
          height: 16,
        } as HTMLImageElement;

        texture.write(mockImage, {
          size: [32, 32],
          fit: 'stretch',
        });

        expect(device.mock.createTexture).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ format: 'rgba8unorm-srgb' }),
        );
      });

      it('writes blobs through createImageBitmap', async ({ root, device }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const blob = new Blob(['image']);
        const imageBitmap = {
          width: 32,
          height: 32,
          close: vi.fn(),
        } as unknown as ImageBitmap;
        const createImageBitmapMock = vi.fn(() => Promise.resolve(imageBitmap));
        vi.stubGlobal('createImageBitmap', createImageBitmapMock);

        await texture.writeAsync(blob);

        expect(createImageBitmapMock).toHaveBeenCalledWith(blob, undefined);
        expect(device.mock.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
          { source: imageBitmap },
          {
            texture: expect.anything(),
            mipLevel: 0,
            origin: { x: 0, y: 0, z: 0 },
          },
          { width: 32, height: 32, depthOrArrayLayers: 1 },
        );
        expect(imageBitmap.close).toHaveBeenCalled();
      });

      it('resizes blobs through createImageBitmap, defaulting to the texture size', async ({
        root,
        device,
      }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const blob = new Blob(['image']);
        const imageBitmap = {
          width: 64,
          height: 64,
          close: vi.fn(),
        } as unknown as ImageBitmap;
        const createImageBitmapMock = vi.fn(() => Promise.resolve(imageBitmap));
        vi.stubGlobal('createImageBitmap', createImageBitmapMock);

        await texture.writeAsync(blob, { fit: 'stretch' });

        expect(createImageBitmapMock).toHaveBeenCalledWith(blob, {
          resizeWidth: 64,
          resizeHeight: 64,
          resizeQuality: 'high',
        });
        expect(device.mock.createRenderPipeline).not.toHaveBeenCalled();
      });

      it('writes channels from distinct sources in one pass per source', ({
        root,
        device,
        commandEncoder,
        renderPassEncoder,
      }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const roughnessMap = {
          width: 32,
          height: 32,
        } as HTMLImageElement;
        const maskMap = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        common.writeChannels(texture, {
          r: { source: roughnessMap, from: 'r' },
          g: undefined,
          a: { source: maskMap, from: 'g' },
        });

        expect(gpuCallTimeline({ device, commandEncoder, renderPassEncoder }))
          .toMatchInlineSnapshot(`
          [
            "createTexture(32x32)",
            "createTexture(32x32)",
            "copyExternalImageToTexture",
            "createCommandEncoder",
            "beginRenderPass(load)",
            "createBindGroup",
            "setViewport(0, 0, 32, 32)",
            "createRenderPipeline",
            "draw",
            "submit",
            "destroyTexture(32x32)",
            "createTexture(32x32)",
            "copyExternalImageToTexture",
            "createCommandEncoder",
            "beginRenderPass(load)",
            "createBindGroup",
            "setViewport(0, 0, 32, 32)",
            "createRenderPipeline",
            "draw",
            "submit",
            "destroyTexture(32x32)",
          ]
        `);

        expect(
          (
            device.mock.createRenderPipeline.mock.calls as unknown as [
              GPURenderPipelineDescriptor,
            ][]
          ).map((call) => call[0].fragment?.targets),
        ).toMatchInlineSnapshot(`
          [
            [
              {
                "format": "rgba8unorm",
                "writeMask": 1,
              },
            ],
            [
              {
                "format": "rgba8unorm",
                "writeMask": 8,
              },
            ],
          ]
        `);
      });

      it('uploads a shared source once and packs its channels in a single pass', ({
        root,
        device,
        commandEncoder,
        renderPassEncoder,
      }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const packedMap = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        common.writeChannels(texture, {
          r: { source: packedMap, from: 'r' },
          g: { source: packedMap, from: 'g' },
          b: { source: packedMap, from: 'b' },
          a: { source: packedMap, from: 'a' },
        });

        expect(gpuCallTimeline({ device, commandEncoder, renderPassEncoder }))
          .toMatchInlineSnapshot(`
          [
            "createTexture(32x32)",
            "createTexture(32x32)",
            "copyExternalImageToTexture",
            "createCommandEncoder",
            "beginRenderPass(load)",
            "createBindGroup",
            "setViewport(0, 0, 32, 32)",
            "createRenderPipeline",
            "draw",
            "setViewport(0, 0, 32, 32)",
            "createRenderPipeline",
            "draw",
            "setViewport(0, 0, 32, 32)",
            "createRenderPipeline",
            "draw",
            "setViewport(0, 0, 32, 32)",
            "createRenderPipeline",
            "draw",
            "submit",
            "destroyTexture(32x32)",
          ]
        `);
      });

      it('reuses cached channel pipelines across writeChannels calls', ({ root, device }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const packedMap = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        common.writeChannels(texture, {
          r: { source: packedMap, from: 'r' },
          g: { source: packedMap, from: 'g' },
        });
        const pipelineCount = device.mock.createRenderPipeline.mock.calls.length;

        common.writeChannels(texture, {
          r: { source: packedMap, from: 'r' },
          g: { source: packedMap, from: 'g' },
        });
        expect(device.mock.createRenderPipeline).toHaveBeenCalledTimes(pipelineCount);
      });

      it('applies shared regions to channel writes', ({
        root,
        commandEncoder,
        renderPassEncoder,
      }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const roughnessMap = {
          width: 8,
          height: 9,
        } as HTMLImageElement;

        common.writeChannels(
          texture,
          { r: { source: roughnessMap, from: 'r' } },
          {
            origin: [4, 5],
            size: [8, 9],
          },
        );

        expect(commandEncoder.mock.copyTextureToTexture).not.toHaveBeenCalled();
        expect(renderPassEncoder.mock.setViewport).toHaveBeenCalledWith(4, 5, 8, 9, 0, 1);
        expect(renderPassEncoder.mock.setScissorRect).toHaveBeenCalledWith(4, 5, 8, 9);
      });

      it('requires a fit mode for channel writes with mismatched sizes', ({ root }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const roughnessMap = {
          width: 16,
          height: 16,
        } as HTMLImageElement;

        expect(() =>
          common.writeChannels(
            texture,
            { r: { source: roughnessMap, from: 'r' } },
            { size: [32, 32] },
          ),
        ).toThrowErrorMatchingInlineSnapshot(
          `[Error: Texture write source size 16x16 does not match target size 32x32. Pass fit: 'stretch' to scale the source or fit: 'clip' to copy the overlapping region.]`,
        );
      });

      it('requires a fit mode for channel writes from a smaller source without a size', ({
        root,
      }) => {
        const texture = root
          .createTexture({
            size: [64, 64],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const roughnessMap = {
          width: 16,
          height: 16,
        } as HTMLImageElement;

        expect(() =>
          common.writeChannels(texture, { r: { source: roughnessMap, from: 'r' } }),
        ).toThrowErrorMatchingInlineSnapshot(
          `[Error: Texture write source size 16x16 does not match target size 64x64. Pass fit: 'stretch' to scale the source or fit: 'clip' to copy the overlapping region.]`,
        );
      });

      it('ignores grouped channel keys (rejected at the type level)', ({ root, device }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
          })
          .$usage('render');

        const roughnessMap = {
          width: 32,
          height: 32,
        } as HTMLImageElement;

        common.writeChannels(texture, { rg: { source: roughnessMap, from: 'r' } } as never);

        expect(device.mock.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
        expect(device.mock.queue.submit).not.toHaveBeenCalled();
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

        const commandEncoder =
          device.mock.createCommandEncoder.mock.results[
            device.mock.createCommandEncoder.mock.results.length - 1
          ]?.value;
        expect(commandEncoder?.copyTextureToTexture).toHaveBeenCalledWith(
          { texture: expect.anything(), mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
          { texture: expect.anything(), mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
          [16, 16, 1],
        );

        expect(commandEncoder?.finish).toHaveBeenCalledTimes(1);
        expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);
      });

      it('copies a region between differently sized textures', ({ root, device }) => {
        const sourceTexture = root.createTexture({
          size: [32, 32],
          format: 'rgba8unorm',
        });

        const targetTexture = root.createTexture({
          size: [16, 16],
          format: 'rgba8unorm',
          mipLevelCount: 2,
        });

        targetTexture.copyFrom(sourceTexture, {
          sourceOrigin: [4, 4],
          origin: [2, 2],
          size: [8, 8],
          mipLevel: 1,
        });

        const commandEncoder =
          device.mock.createCommandEncoder.mock.results[
            device.mock.createCommandEncoder.mock.results.length - 1
          ]?.value;
        expect(commandEncoder?.copyTextureToTexture).toHaveBeenCalledWith(
          { texture: expect.anything(), mipLevel: 0, origin: { x: 4, y: 4, z: 0 } },
          { texture: expect.anything(), mipLevel: 1, origin: { x: 2, y: 2, z: 0 } },
          [8, 8, 1],
        );
      });

      it('clears with a color using empty render passes', ({ root, device, commandEncoder }) => {
        const texture = root
          .createTexture({
            size: [8, 8],
            format: 'rgba8unorm',
            mipLevelCount: 2,
          })
          .$usage('render');

        texture.clear([0, 0.5, 0, 1]);

        expect(device.mock.queue.writeTexture).not.toHaveBeenCalled();
        expect(commandEncoder.mock.beginRenderPass).toHaveBeenCalledTimes(2);
        expect(commandEncoder.mock.beginRenderPass).toHaveBeenCalledWith(
          expect.objectContaining({
            colorAttachments: [
              expect.objectContaining({ loadOp: 'clear', clearValue: [0, 0.5, 0, 1] }),
            ],
          }),
        );
        expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);

        expect(() =>
          root.createTexture({ size: [8, 8], format: 'rgba8unorm' }).clear([0, 0, 0, 1]),
        ).toThrowErrorMatchingInlineSnapshot(
          `[Error: texture.clear(color) requires 'render' usage. Add it via the $usage('render') method.]`,
        );
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
        expect(() => targetTexture.copyFrom(sourceTexture)).toThrow('Texture format mismatch');
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
        expect(() => targetTexture.copyFrom(sourceTexture)).toThrow('Texture size mismatch');
      });

      it('throws error when write is called with incorrect buffer size', ({ root }) => {
        const texture = root.createTexture({
          size: [4, 4],
          format: 'rgba8unorm',
        });

        const incorrectData = new Uint8Array(32); // Should be 64 bytes for 4x4x4

        expect(() => texture.write(incorrectData)).toThrow('Buffer size mismatch');
      });

      it('warns and returns early when generateMipmaps would generate no mipmaps', ({ root }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
            mipLevelCount: 3,
          })
          .$usage('render');

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Base mip level 3 would result in 0 mip levels to generate, so it should return early
        expect(() => texture.generateMipmaps(3)).not.toThrow();

        expect(consoleSpy).toHaveBeenCalledWith(
          'generateMipmaps is a no-op: would generate 0 mip levels (base: 3, total: 3)',
        );

        consoleSpy.mockRestore();
      });

      it('warns when generateMipmaps would generate only 1 mip level', ({ root }) => {
        const texture = root
          .createTexture({
            size: [32, 32],
            format: 'rgba8unorm',
            mipLevelCount: 3,
          })
          .$usage('render');

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Base mip level 2 would result in 1 mip level to generate (3-2=1), so it should warn and return early
        expect(() => texture.generateMipmaps(2)).not.toThrow();

        expect(consoleSpy).toHaveBeenCalledWith(
          'generateMipmaps is a no-op: would generate 1 mip levels (base: 2, total: 3)',
        );

        consoleSpy.mockRestore();
      });

      it('throws an error and warns on the type level when the required render usage is missing', ({
        root,
      }) => {
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

        expect(() => texture.generateMipmaps()).toThrowErrorMatchingInlineSnapshot(
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

    const createRenderPipeline = (root: TgpuRoot) =>
      root.createRenderPipeline({
        vertex: vertexFn,
        fragment: fragmentFn,
        targets: { format: 'rgba8unorm' },
      });

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

    it('works correctly when using either a texture or its view as a depth-stencil attachment', ({
      root,
    }) => {
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

      () => {
        createRenderPipeline(root).withDepthStencilAttachment({
          // @ts-expect-error
          view: texture,
        });
      };
    });

    it('rejects storage views for color attachments', ({ root }) => {
      const texture = root
        .createTexture({
          size: [128, 128],
          format: 'rgba8unorm',
        })
        .$usage('storage');

      const textureView = texture.createView(d.textureStorage2d('rgba8unorm', 'read-write'));

      () => {
        createRenderPipeline(root).withColorAttachment({
          // @ts-expect-error
          view: textureView,
          loadOp: 'clear',
          storeOp: 'store',
        });
      };
    });
  });
});

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import type {
  TgpuMutableTexture,
  TgpuReadonlyTexture,
  TgpuSampledTexture,
  TgpuTexture,
  TgpuWriteonlyTexture,
} from '../src/core/texture/texture';
import type { Render, Sampled } from '../src/core/texture/usageExtension';
import {
  type F32,
  type I32,
  type U32,
  type Vec4f,
  type Vec4i,
  type Vec4u,
  f32,
  u32,
} from '../src/data';
import {
  type ExperimentalTgpuRoot,
  StrictNameRegistry,
  tgpu,
  wgsl,
} from '../src/experimental';
import { ResolutionCtxImpl } from '../src/resolutionCtx';
import './utils/webgpuGlobals';

const mockDevice = {
  createBindGroup: vi.fn(() => 'mockBindGroup'),
  createBindGroupLayout: vi.fn(() => 'mockBindGroupLayout'),
  createBuffer: vi.fn(() => 'mockBuffer'),
  createCommandEncoder: vi.fn(() => 'mockCommandEncoder'),
  createComputePipeline: vi.fn(() => 'mockComputePipeline'),
  createPipelineLayout: vi.fn(() => 'mockPipelineLayout'),
  createRenderPipeline: vi.fn(() => 'mockRenderPipeline'),
  createSampler: vi.fn(() => 'mockSampler'),
  createShaderModule: vi.fn(() => 'mockShaderModule'),
  createTexture: vi.fn(() => 'mockTexture'),
  importExternalTexture: vi.fn(() => 'mockExternalTexture'),
  queue: {
    copyExternalImageToTexture: vi.fn(),
    onSubmittedWorkDone: vi.fn(),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
  },
};

function useRoot() {
  let root: ExperimentalTgpuRoot;

  beforeEach(() => {
    root = tgpu.initFromDevice({
      device: mockDevice as unknown as GPUDevice,
    });
  });

  afterEach(() => {
    root.destroy();
    vi.resetAllMocks();
  });

  return () => root;
}

describe('TgpuTexture', () => {
  const getRoot = useRoot();

  it('makes passing the default, `undefined` or omitting an option prop result in the same type.', () => {
    const commonProps = {
      size: [512, 512],
      format: 'rgba8unorm',
    } as const;

    const texture1 = getRoot().createTexture({
      ...commonProps,
    });

    const texture2 = getRoot().createTexture({
      ...commonProps,
      dimension: undefined,
      mipLevelCount: undefined,
      sampleCount: undefined,
      viewFormats: undefined,
    });

    const texture3 = getRoot().createTexture({
      ...commonProps,
      dimension: '2d',
      mipLevelCount: 1,
      sampleCount: 1,
      viewFormats: [],
    });

    expectTypeOf(texture1).toEqualTypeOf(texture2);
    expectTypeOf(texture1).toEqualTypeOf(texture3);
  });

  it('embeds a non-default dimension in the type', () => {
    const commonProps = {
      size: [512, 512],
      format: 'rgba8unorm',
    } as const;

    const texture1 = getRoot().createTexture({
      ...commonProps,
      dimension: '3d',
    });

    const texture2 = getRoot().createTexture({
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

  it('embeds a non-default mipLevelCount in the type', () => {
    const texture = getRoot().createTexture({
      size: [512, 512],
      format: 'rgba8unorm',
      mipLevelCount: 2,
    });

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm'; mipLevelCount: 2 }>
    >();
  });

  it('embeds a non-default sampleCount in the type', () => {
    const texture = getRoot().createTexture({
      size: [512, 512],
      format: 'rgba8unorm',
      sampleCount: 2,
    });

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm'; sampleCount: 2 }>
    >();
  });

  it('embeds non-default viewFormats in the type', () => {
    const texture = getRoot().createTexture({
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

  it('makes a readonly size tuple mutable in the resulting type', () => {
    // This is because there should be no difference between a texture
    // that was created with a readonly size tuple, and one created
    // with a mutable size tuple.

    const texture = getRoot().createTexture({
      size: [1, 2, 3] as const,
      format: 'rgba8unorm',
    });

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [1, 2, 3]; format: 'rgba8unorm' }>
    >();
  });

  it('rejects non-strict or invalid size tuples', () => {
    getRoot().createTexture({
      // @ts-expect-error
      size: [],
      format: 'rgba8unorm',
    });

    getRoot().createTexture({
      // @ts-expect-error
      size: [1, 2] as number[], // <- too loose
      format: 'rgba8unorm',
    });
  });

  it('infers `sampled` usage', () => {
    const texture = getRoot()
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
      })
      .$usage('sampled');

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm' }> & Sampled
    >();
  });

  it('infers combined usage', () => {
    const texture = getRoot()
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
      })
      .$usage('sampled', 'render');

    expectTypeOf(texture).toEqualTypeOf<
      TgpuTexture<{ size: [512, 512]; format: 'rgba8unorm' }> & Sampled & Render
    >();
  });

  it('limits available extensions based on the chosen format', () => {
    getRoot()
      .createTexture({
        format: 'astc-10x10-unorm',
        size: [512, 512],
      })
      // @ts-expect-error
      .$usage('storage');
  });

  it('creates a sampled texture view with correct type', () => {
    const texture = getRoot()
      .createTexture({
        size: [512, 512, 12],
        format: 'rgba8unorm',
      })
      .$name('texture')
      .$usage('sampled');

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    let code = wgsl`
      let x = ${texture.asSampled()};
    `;

    expect(resolutionCtx.resolve(code)).toContain('texture_2d<u32>');

    code = wgsl`
      let x = ${texture.asSampled({ dimension: '2d-array' })};
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
    const mockHTMLMediaElement = {
      width: 1,
      height: 1,
    } as HTMLVideoElement;

    const texture = wgsl.textureExternal(mockHTMLMediaElement).$name('texture');

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    const code = wgsl`
      let x = ${texture};
    `;

    expect(resolutionCtx.resolve(code)).toContain('texture_external');
  });
});

describe('TgpuReadonlyTexture/TgpuWriteonlyTexture/TgpuMutableTexture', () => {
  const getRoot = useRoot();

  it('inherits the dimension and format from its owner texture', () => {
    const texture1 = getRoot()
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

    const texture2 = getRoot()
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

    const texture3 = getRoot()
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

  it('rejects formats different than those specified when defining the texture', () => {
    const texture = getRoot()
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
      format: 'r8unorm',
    });

    texture.asMutable({
      // @ts-expect-error
      format: 'rg8unorm',
    });
  });
});

describe('TgpuSampledTexture', () => {
  const getRoot = useRoot();

  it('inherits the dimension and format from its owner texture', () => {
    const texture1 = getRoot()
      .createTexture({
        size: [512, 512],
        format: 'rgba8unorm',
      })
      .$usage('sampled');

    expectTypeOf(texture1.asSampled()).toEqualTypeOf<
      TgpuSampledTexture<'2d', F32>
    >();

    const texture2 = getRoot()
      .createTexture({
        size: [512, 512],
        format: 'rgba8uint',
        dimension: '3d',
      })
      .$usage('sampled');

    expectTypeOf(texture2.asSampled()).toEqualTypeOf<
      TgpuSampledTexture<'3d', U32>
    >();

    const texture3 = getRoot()
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

  it('rejects formats different than those specified when defining the texture', () => {
    const texture = getRoot()
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

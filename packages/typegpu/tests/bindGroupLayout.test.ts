import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { type F32, type U32, type Vec3f, f32, u32, vec3f } from '../src/data';
import tgpu, {
  type ExperimentalTgpuRoot,
  type TgpuBindGroupLayout,
  asUniform,
  type TgpuBuffer,
  type TgpuBufferUniform,
  type TgpuBufferReadonly,
  type TgpuBufferMutable,
} from '../src/experimental';
import './utils/webgpuGlobals';
import type { Storage, Uniform } from '../src/core/buffer/buffer';
import { MissingBindingError } from '../src/tgpuBindGroupLayout';

const DEFAULT_READONLY_VISIBILITY_FLAGS =
  GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;

const mockBuffer = {
  getMappedRange: vi.fn(() => new ArrayBuffer(8)),
  unmap: vi.fn(),
  mapAsync: vi.fn(),
  destroy: vi.fn(),
};

const mockTexture = {
  createView: vi.fn(() => 'view'),
};

const mockCommandEncoder = {
  beginComputePass: vi.fn(() => mockComputePassEncoder),
  beginRenderPass: vi.fn(() => mockRenderPassEncoder),
  copyBufferToBuffer: vi.fn(),
  copyBufferToTexture: vi.fn(),
  copyTextureToBuffer: vi.fn(),
  copyTextureToTexture: vi.fn(),
  finish: vi.fn(),
};

const mockComputePassEncoder = {
  dispatchWorkgroups: vi.fn(),
  end: vi.fn(),
  setBindGroup: vi.fn(),
  setPipeline: vi.fn(),
};

const mockRenderPassEncoder = {
  draw: vi.fn(),
  end: vi.fn(),
  setBindGroup: vi.fn(),
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
};

const mockDevice = {
  createBindGroup: vi.fn(
    (_descriptor: GPUBindGroupDescriptor) => 'mockBindGroup',
  ),
  createBindGroupLayout: vi.fn(
    (_descriptor: GPUBindGroupLayoutDescriptor) => 'mockBindGroupLayout',
  ),
  createBuffer: vi.fn(() => mockBuffer),
  createCommandEncoder: vi.fn(() => mockCommandEncoder),
  createComputePipeline: vi.fn(() => 'mockComputePipeline'),
  createPipelineLayout: vi.fn(() => 'mockPipelineLayout'),
  createRenderPipeline: vi.fn(() => 'mockRenderPipeline'),
  createSampler: vi.fn(() => 'mockSampler'),
  createShaderModule: vi.fn(() => 'mockShaderModule'),
  createTexture: vi.fn(() => mockTexture),
  importExternalTexture: vi.fn(() => 'mockExternalTexture'),
  queue: {
    copyExternalImageToTexture: vi.fn(),
    onSubmittedWorkDone: vi.fn(),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
  },
};

describe('TgpuBindGroupLayout', () => {
  let root: ExperimentalTgpuRoot;

  beforeEach(async () => {
    root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    root.destroy();
  });

  it('infers the bound type of a uniform entry', () => {
    const layout = tgpu.bindGroupLayout({
      position: { uniform: vec3f },
    });

    const { position } = layout.bound;

    expectTypeOf(position).toEqualTypeOf<TgpuBufferUniform<Vec3f>>();
  });

  it('infers the bound type of a readonly storage entry', () => {
    const layout = tgpu.bindGroupLayout({
      a: { storage: vec3f },
      b: { storage: vec3f, access: 'readonly' },
    });

    const { a, b } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferReadonly<Vec3f>>();
    expectTypeOf(b).toEqualTypeOf<TgpuBufferReadonly<Vec3f>>();
  });

  it('infers the bound type of a mutable storage entry', () => {
    const layout = tgpu.bindGroupLayout({
      a: { storage: vec3f, access: 'mutable' },
    });

    const { a } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferMutable<Vec3f>>();
  });

  it('omits null properties', async () => {
    const layout = tgpu
      .bindGroupLayout({
        a: { uniform: vec3f }, // binding 0
        _0: null, // binding 1
        c: { storage: vec3f }, // binding 2
      })
      .$name('example_layout');

    expectTypeOf(layout).toEqualTypeOf<
      TgpuBindGroupLayout<{
        a: { uniform: Vec3f };
        _0: null;
        c: { storage: Vec3f };
      }>
    >();

    const root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });

    root.unwrap(layout); // Creating the WebGPU resource

    expect(mockDevice.createBindGroupLayout).toBeCalledWith({
      label: 'example_layout',
      entries: [
        {
          binding: 0,
          visibility: DEFAULT_READONLY_VISIBILITY_FLAGS,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 2,
          visibility: DEFAULT_READONLY_VISIBILITY_FLAGS,
          buffer: {
            type: 'read-only-storage',
          },
        },
      ],
    });
  });
});

describe('TgpuBindGroup', () => {
  let root: ExperimentalTgpuRoot;

  beforeEach(async () => {
    root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    root.destroy();
  });

  describe('buffer layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { uniform: Vec3f } }>;
    let buffer: TgpuBuffer<Vec3f> & Uniform;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { uniform: vec3f },
        })
        .$name('example');

      buffer = root.createBuffer(vec3f).$usage('uniform');
    });

    it('populates a simple layout with a raw buffer', async () => {
      const bindGroup = layout.populate({ foo: root.unwrap(buffer) });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: root.unwrap(buffer),
            },
          },
        ],
      });
    });

    it('populates a simple layout with a typed buffer', async () => {
      const bindGroup = layout.populate({ foo: buffer });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: root.unwrap(buffer),
            },
          },
        ],
      });
    });

    it('populates a simple layout with a typed buffer usage', async () => {
      const bindGroup = layout.populate({ foo: asUniform(buffer) });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: root.unwrap(buffer),
            },
          },
        ],
      });
    });
  });

  describe('filtering sampler layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { sampler: 'filtering' } }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { sampler: 'filtering' },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw sampler', async () => {
      const sampler = root.device.createSampler();

      const bindGroup = layout.populate({
        foo: sampler,
      });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: sampler,
          },
        ],
      });
    });
  });

  describe('texture layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { texture: 'float' } }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { texture: 'float' },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw texture view', async () => {
      const view = root.device
        .createTexture({
          format: 'rgba8unorm',
          size: [32, 32],
          usage: GPUTextureUsage.TEXTURE_BINDING,
        })
        .createView();

      const bindGroup = layout.populate({
        foo: view,
      });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: view,
          },
        ],
      });
    });
  });

  describe('storage texture layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { storageTexture: 'rgba8unorm' } }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { storageTexture: 'rgba8unorm' },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw texture view', async () => {
      const view = root.device
        .createTexture({
          format: 'rgba8unorm',
          size: [32, 32],
          usage: GPUTextureUsage.TEXTURE_BINDING,
        })
        .createView();

      const bindGroup = layout.populate({
        foo: view,
      });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: view,
          },
        ],
      });
    });
  });

  describe('external texture layout', () => {
    let layout: TgpuBindGroupLayout<{
      foo: { externalTexture: Record<string, never> };
    }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { externalTexture: {} },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw texture view', async () => {
      const externalTexture = root.device.importExternalTexture({
        source: undefined as unknown as HTMLVideoElement,
      });

      const bindGroup = layout.populate({
        foo: externalTexture,
      });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: externalTexture,
          },
        ],
      });
    });
  });

  describe('multiple-entry layout', () => {
    let layout: TgpuBindGroupLayout<{
      a: { uniform: Vec3f };
      b: { storage: U32; access: 'mutable' };
      _: null;
      d: { storage: F32; access: 'readonly' };
    }>;
    let aBuffer: TgpuBuffer<Vec3f> & Uniform;
    let bBuffer: TgpuBuffer<U32> & Storage;
    let dBuffer: TgpuBuffer<F32> & Storage;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          a: { uniform: vec3f },
          b: { storage: u32, access: 'mutable' },
          _: null,
          d: { storage: f32, access: 'readonly' },
        })
        .$name('example');

      aBuffer = root.createBuffer(vec3f).$usage('uniform');
      bBuffer = root.createBuffer(u32).$usage('storage');
      dBuffer = root.createBuffer(f32).$usage('storage');
    });

    it('requires all non-null entries to be populated', () => {
      expect(() => {
        // @ts-expect-error
        const bindGroup = layout.populate({
          a: aBuffer,
          b: bBuffer,
        });
      }).toThrow(new MissingBindingError('example', 'd'));
    });

    it('creates bind group in layout-defined order, not the insertion order of the populate parameter', () => {
      const bindGroup = layout.populate({
        // purposefully out of order
        d: dBuffer,
        b: bBuffer,
        a: aBuffer,
      });

      root.unwrap(bindGroup);

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: root.unwrap(aBuffer),
            },
          },
          {
            binding: 1,
            resource: {
              buffer: root.unwrap(bBuffer),
            },
          },
          // note that binding 2 is missing, as it gets skipped on purpose by using the null prop.
          {
            binding: 3,
            resource: {
              buffer: root.unwrap(dBuffer),
            },
          },
        ],
      });
    });
  });
});

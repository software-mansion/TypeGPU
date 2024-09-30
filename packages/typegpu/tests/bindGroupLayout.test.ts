import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { type Vec3f, vec3f } from '../src/data';
import tgpu, {
  type TgpuRuntime,
  type TgpuBufferUsage,
  type TgpuBindGroupLayout,
} from '../src/experimental';
import './utils/webgpuGlobals';

const DEFAULT_VISIBILITY_FLAGS =
  GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;

const mockBuffer = {
  getMappedRange: vi.fn(() => new ArrayBuffer(8)),
  unmap: vi.fn(),
  mapAsync: vi.fn(),
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
  createBindGroup: vi.fn(() => 'mockBindGroup'),
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

describe('TgpuBindGroupLayout', () => {
  let root: TgpuRuntime;

  beforeEach(async () => {
    root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });
  });

  afterEach(() => {
    root.destroy();
  });

  it('infers the bound type of a uniform entry', () => {
    const layout = tgpu.bindGroupLayout({
      position: { uniform: vec3f },
    });

    const { position } = layout.bound;

    expectTypeOf(position).toEqualTypeOf<TgpuBufferUsage<Vec3f, 'uniform'>>();
  });

  it('infers the bound type of a readonly storage entry', () => {
    const layout = tgpu.bindGroupLayout({
      a: { storage: vec3f },
      b: { storage: vec3f, access: 'readonly' },
    });

    const { a, b } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferUsage<Vec3f, 'readonly'>>();
    expectTypeOf(b).toEqualTypeOf<TgpuBufferUsage<Vec3f, 'readonly'>>();
  });

  it('omits null properties', async () => {
    const layout = tgpu
      .bindGroupLayout({
        a: { uniform: vec3f }, // binding 0
        _0: null, // binding 1
        c: { storage: vec3f }, // binding 2
      })
      .$name('example_layout');

    // omits null property in type
    expectTypeOf(layout).toEqualTypeOf<
      TgpuBindGroupLayout<{ a: { uniform: Vec3f }; c: { storage: Vec3f } }>
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
          visibility: DEFAULT_VISIBILITY_FLAGS,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 2,
          visibility: DEFAULT_VISIBILITY_FLAGS,
          buffer: {
            type: 'read-only-storage',
          },
        },
      ],
    });
  });
});

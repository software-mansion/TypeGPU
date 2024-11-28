import { afterEach, beforeEach, describe, expectTypeOf, it, vi } from 'vitest';
import tgpu from '../src';
import { f32 } from '../src/data';
import { type ExperimentalTgpuRoot, asUniform } from '../src/experimental';
import type { Infer } from '../src/repr';
import './utils/webgpuGlobals';

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
  createBindGroupLayout: vi.fn(() => 'mockBindGroupLayout'),
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

describe('TgpuBufferReadonly', () => {
  const getRoot = useRoot();

  it('represents a `number` value', () => {
    const root = getRoot();
    const buffer = root.createBuffer(f32).$usage('uniform');
    const uniform = asUniform(buffer);

    expectTypeOf<Infer<typeof uniform>>().toEqualTypeOf<number>();
  });
});

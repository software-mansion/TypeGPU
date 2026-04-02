// oxlint-disable no-empty-pattern
import { test as base, vi } from 'vitest';
import tgpu, { type TgpuRoot } from 'typegpu';
// oxlint-disable-next-line import/no-unassigned-import -- imported for side effects
import './webgpuGlobals.ts';

const createTextureMock = (descriptor: GPUTextureDescriptor) => ({
  ...descriptor,
  with: (descriptor.size as number[])[0] ?? 1,
  height: (descriptor.size as number[])[1] ?? 1,
  depthOrArrayLayers: (descriptor.size as number[])[2] ?? 1,
  createView: vi.fn(() => 'view'),
  destroy: vi.fn(),
});

type ExperimentalTgpuRoot = TgpuRoot & TgpuRoot['~unstable'];

export const it = base
  .extend('renderPassEncoder', () => {
    const mockRenderPassEncoder = {
      get mock() {
        return mockRenderPassEncoder;
      },
      draw: vi.fn(),
      drawIndexed: vi.fn(),
      end: vi.fn(),
      setBindGroup: vi.fn(),
      setPipeline: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      setStencilReference: vi.fn(),
      executeBundles: vi.fn(),
    };

    return mockRenderPassEncoder as unknown as GPURenderPassEncoder & {
      mock: typeof mockRenderPassEncoder;
    };
  })
  .extend('commandEncoder', ({ renderPassEncoder }) => {
    const mockComputePassEncoder = {
      dispatchWorkgroups: vi.fn(),
      dispatchWorkgroupsIndirect: vi.fn(),
      end: vi.fn(),
      setBindGroup: vi.fn(),
      setPipeline: vi.fn(),
    };

    const mockCommandEncoder = {
      get mock() {
        return mockCommandEncoder;
      },
      beginComputePass: vi.fn(() => mockComputePassEncoder),
      beginRenderPass: vi.fn(() => renderPassEncoder),
      clearBuffer: vi.fn(),
      copyBufferToBuffer: vi.fn(),
      copyBufferToTexture: vi.fn(),
      copyTextureToBuffer: vi.fn(),
      copyTextureToTexture: vi.fn(),
      resolveQuerySet: vi.fn(),
      finish: vi.fn(),
    };

    return mockCommandEncoder as unknown as GPUCommandEncoder & { mock: typeof mockCommandEncoder };
  })
  .extend('device', ({ commandEncoder }) => {
    const mockQuerySet = {
      destroy: vi.fn(),
      get label() {
        return this._label || '<unnamed>';
      },
      set label(value) {
        this._label = value;
      },
      _label: '<unnamed>',
    };

    const mockComputePipeline = {
      get getBindGroupLayout() {
        return vi.fn(() => 'mockBindGroupLayout');
      },
      label: '<unnamed>',
    };

    const mockDevice = {
      get mock() {
        return mockDevice;
      },
      features: new Set(['timestamp-query']),
      createBindGroup: vi.fn((_descriptor: GPUBindGroupDescriptor) => 'mockBindGroup'),
      createBindGroupLayout: vi.fn(
        (_descriptor: GPUBindGroupLayoutDescriptor) => 'mockBindGroupLayout',
      ),
      createBuffer: vi.fn(({ size, usage, mappedAtCreation, label }: GPUBufferDescriptor) => {
        const mockBuffer = {
          mapState: mappedAtCreation ? 'mapped' : 'unmapped',
          size,
          usage,
          label: label ?? '<unnamed>',
          getMappedRange: vi.fn(() => new ArrayBuffer(size)),
          unmap: vi.fn(() => {
            mockBuffer.mapState = 'unmapped';
          }),
          mapAsync: vi.fn(() => {
            mockBuffer.mapState = 'mapped';
          }),
          destroy: vi.fn(),
        };

        return mockBuffer;
      }),
      createCommandEncoder: vi.fn(function () {
        return commandEncoder;
      }),
      createComputePipeline: vi.fn(() => mockComputePipeline),
      createPipelineLayout: vi.fn(() => 'mockPipelineLayout'),
      createQuerySet: vi.fn(({ type, count }: GPUQuerySetDescriptor) => {
        const querySet = Object.create(mockQuerySet);
        querySet.type = type;
        querySet.count = count;
        querySet._label = '<unnamed>';
        return querySet;
      }),
      createRenderPipeline: vi.fn(() => 'mockRenderPipeline'),
      createSampler: vi.fn(() => 'mockSampler'),
      createShaderModule: vi.fn(() => 'mockShaderModule'),
      createTexture: vi.fn((descriptor) => createTextureMock(descriptor)),
      importExternalTexture: vi.fn(() => 'mockExternalTexture'),
      queue: {
        copyExternalImageToTexture: vi.fn(),
        onSubmittedWorkDone: vi.fn(() => Promise.resolve()),
        submit: vi.fn(),
        writeBuffer: vi.fn(),
        writeTexture: vi.fn(),
      },
      limits: {
        maxUniformBuffersPerShaderStage: 12,
        maxStorageBuffersPerShaderStage: 8,
      },
      destroy: vi.fn(),
    };

    return mockDevice as unknown as GPUDevice & { mock: typeof mockDevice };
  })
  .extend('adapter', ({ device }) => {
    const adapterMock = {
      features: new Set(['timestamp-query']),
      requestDevice: vi.fn((_descriptor) => Promise.resolve(device)),
      limits: {
        maxStorageBufferBindingSize: 64 * 1024 * 1024,
        maxBufferSize: 64 * 1024 * 1024,
      },
    };

    return adapterMock;
  })
  .extend('navigator', ({ adapter }) => {
    const navigatorMock = {
      gpu: {
        __brand: 'GPU',
        requestAdapter: vi.fn(() => Promise.resolve(adapter)),
        getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
      },
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve()),
      },
    };

    return navigatorMock;
  })
  .extend('_global', { auto: true }, ({ navigator }, { onCleanup }) => {
    vi.stubGlobal('navigator', navigator);

    onCleanup(() => {
      vi.unstubAllGlobals();
    });
  })
  .extend('root', async ({}, { onCleanup }) => {
    const root = await tgpu.init();

    onCleanup(() => root.destroy());

    return root as ExperimentalTgpuRoot;
  })
  .extend('renderBundleEncoder', () => {
    const mockRenderBundleEncoder = {
      draw: vi.fn(),
      drawIndexed: vi.fn(),
      setBindGroup: vi.fn(),
      setPipeline: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      finish: vi.fn(() => 'mockRenderBundle'),
      label: '<unnamed>',
    };

    return mockRenderBundleEncoder as unknown as GPURenderBundleEncoder & {
      mock: typeof mockRenderBundleEncoder;
    };
  });

export const test = it;

// oxlint-disable no-empty-pattern
import { test as base, vi } from 'vitest';
import tgpu, { type TgpuRoot } from 'typegpu';
// oxlint-disable-next-line import/no-unassigned-import -- imported for side effects
import './webgpuGlobals.ts';

const createTextureMock = (descriptor: GPUTextureDescriptor) => {
  const size =
    'width' in descriptor.size
      ? [descriptor.size.width, descriptor.size.height, descriptor.size.depthOrArrayLayers]
      : [...descriptor.size];

  return {
    ...descriptor,
    label: descriptor.label ?? '',
    width: size[0] ?? 1,
    height: size[1] ?? 1,
    depthOrArrayLayers: size[2] ?? 1,
    createView: vi.fn((viewDesc?: GPUTextureViewDescriptor) => ({ label: viewDesc?.label ?? '' })),
    destroy: vi.fn(),
  };
};

type ExperimentalTgpuRoot = TgpuRoot & TgpuRoot['~unstable'];

export const it = base
  .extend('renderPassEncoder', () => {
    const mockRenderPassEncoder = {
      get mock() {
        return mockRenderPassEncoder;
      },
      draw: vi.fn(),
      drawIndexed: vi.fn(),
      drawIndirect: vi.fn(),
      drawIndexedIndirect: vi.fn(),
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
          label: label ?? '',
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
      createComputePipeline: vi.fn((descriptor: GPUComputePipelineDescriptor) => ({
        label: descriptor.label ?? '',
        getBindGroupLayout: vi.fn(() => 'mockBindGroupLayout'),
      })),
      createPipelineLayout: vi.fn(() => 'mockPipelineLayout'),
      createQuerySet: vi.fn(
        ({ type, count, label }: GPUQuerySetDescriptor): GPUQuerySet => ({
          __brand: 'GPUQuerySet',
          destroy: vi.fn(),
          type,
          count: count,
          label: label ?? '',
        }),
      ),
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
  .extend('_stallDeviceRequest', ({ device }) => {
    let stallResolve: () => void;
    let stallPromise: Promise<void> | undefined;
    let devicePromise: Promise<GPUDevice> | undefined;

    const result = {
      enabled: false,
      get stallPromise() {
        return (stallPromise ??= new Promise<void>((r) => {
          stallResolve = r;
        }));
      },
      get devicePromise(): Promise<GPUDevice> {
        return (devicePromise ??= this.stallPromise.then(() => device));
      },
      get stallResolve() {
        void this.stallPromise; // ensuring the promise is initialized
        return stallResolve;
      },
    };

    return result;
  })
  .extend('adapter', ({ device, _stallDeviceRequest }) => {
    const adapterMock = {
      features: new Set(['timestamp-query']),
      requestDevice: vi.fn((_descriptor) => {
        if (_stallDeviceRequest.enabled) {
          return _stallDeviceRequest.devicePromise;
        }

        return Promise.resolve(device);
      }),
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
  /**
   * Used to introduce an artificial delay between requesting a device and getting it.
   * @example
   * ```ts
   * it('foo', ({ stallDeviceRequest }) => {
   *   const resume = stallDeviceRequest();
   *
   *   // do something asynchronous that requests a device
   *
   *   const device = await resume(); // causes the device to resolve
   * });
   * ```
   */
  .extend('stallDeviceRequest', ({ _stallDeviceRequest }) => {
    return () => {
      if (_stallDeviceRequest.enabled) {
        throw new Error('Cannot stall .requestDevice() more than once at a time');
      }
      _stallDeviceRequest.enabled = true;

      return async () => {
        _stallDeviceRequest.stallResolve();
        _stallDeviceRequest.enabled = false;
        return await _stallDeviceRequest.devicePromise;
      };
    };
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
      label: '',
    };

    return mockRenderBundleEncoder as unknown as GPURenderBundleEncoder & {
      mock: typeof mockRenderBundleEncoder;
    };
  });

export const test = it;

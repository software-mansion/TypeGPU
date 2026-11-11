/**
 * A fake `navigator.gpu` and canvas that log every WebGPU call an app makes,
 * so that the GPU work of two builds of the same app can be compared without a GPU.
 */

export interface LogEntry {
  kind: string;
  id: number;
  desc: unknown;
}

interface MockObject {
  __kind: string;
  __id: number;
}

function isMock(value: unknown): value is MockObject {
  return typeof value === 'object' && value !== null && '__id' in value;
}

function bytesOf(data: BufferSource, dataOffset = 0, size?: number): number[] {
  const view = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  return Array.from(view.subarray(dataOffset, size !== undefined ? dataOffset + size : undefined));
}

const limits = {
  maxBindGroups: 4,
  maxBindGroupsPlusVertexBuffers: 24,
  maxStorageBuffersPerShaderStage: 8,
  maxUniformBuffersPerShaderStage: 12,
  maxComputeWorkgroupsPerDimension: 65535,
  maxComputeWorkgroupSizeX: 256,
  maxComputeWorkgroupSizeY: 256,
  maxComputeWorkgroupSizeZ: 64,
  maxComputeInvocationsPerWorkgroup: 256,
  maxSampledTexturesPerShaderStage: 16,
  maxSamplersPerShaderStage: 16,
  maxStorageTexturesPerShaderStage: 4,
  maxBindingsPerBindGroup: 1000,
  maxDynamicUniformBuffersPerPipelineLayout: 8,
  maxDynamicStorageBuffersPerPipelineLayout: 4,
  maxBufferSize: 2 ** 28,
  maxStorageBufferBindingSize: 2 ** 27,
  maxUniformBufferBindingSize: 65536,
  maxVertexBuffers: 8,
  maxVertexAttributes: 16,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
};

export function installMockGpu(options: { frames?: number } = {}): LogEntry[] {
  const log: LogEntry[] = [];
  let nextId = 0;

  const ref = (value: unknown) => (isMock(value) ? `#${value.__kind}${value.__id}` : value);
  const serialize = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (isMock(value)) {
      return ref(value);
    }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return `<${value.byteLength} bytes>`;
    }
    if (Array.isArray(value)) {
      return value.map(serialize);
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'device')
        .map(([key, item]) => [key, serialize(item)]),
    );
  };

  const obj = <T extends object>(kind: string, desc: unknown, extra?: T) => {
    const id = nextId++;
    log.push({ kind, id, desc: serialize(desc) });
    return { __kind: kind, __id: id, label: '', ...extra };
  };

  const passMethods = [
    'setPipeline',
    'setBindGroup',
    'end',
    'pushDebugGroup',
    'popDebugGroup',
    'insertDebugMarker',
  ];
  const methodsOf: Record<string, Set<string>> = {
    commandEncoder: new Set([
      'beginRenderPass',
      'beginComputePass',
      'copyBufferToBuffer',
      'copyBufferToTexture',
      'copyTextureToBuffer',
      'copyTextureToTexture',
      'clearBuffer',
      'resolveQuerySet',
      'writeTimestamp',
      'finish',
      'pushDebugGroup',
      'popDebugGroup',
      'insertDebugMarker',
    ]),
    computePass: new Set([
      ...passMethods,
      'dispatchWorkgroups',
      'dispatchWorkgroupsIndirect',
      'setImmediates',
    ]),
    renderPass: new Set([
      ...passMethods,
      'setVertexBuffer',
      'setIndexBuffer',
      'draw',
      'drawIndexed',
      'drawIndirect',
      'drawIndexedIndirect',
      'setViewport',
      'setScissorRect',
      'setBlendConstant',
      'setStencilReference',
      'executeBundles',
      'beginOcclusionQuery',
      'endOcclusionQuery',
      'setImmediates',
    ]),
    renderBundleEncoder: new Set([
      'setPipeline',
      'setBindGroup',
      'setVertexBuffer',
      'setIndexBuffer',
      'draw',
      'drawIndexed',
      'drawIndirect',
      'drawIndexedIndirect',
      'finish',
      'pushDebugGroup',
      'popDebugGroup',
      'insertDebugMarker',
    ]),
  };

  const encoderLike = (kind: string, desc: unknown = {}): object => {
    const target = obj(kind, desc);
    return new Proxy(target, {
      get(t, prop) {
        if (prop in t) {
          return t[prop as keyof typeof t];
        }
        // Only what the real object has, so that type guards tell passes and encoders apart
        if (typeof prop === 'symbol' || prop === 'then' || !methodsOf[kind]?.has(prop)) {
          return undefined;
        }
        return (...args: unknown[]) => {
          log.push({ kind: `${kind}.${String(prop)}`, id: t.__id, desc: serialize(args) });
          if (prop === 'beginRenderPass') {
            return encoderLike('renderPass');
          }
          if (prop === 'beginComputePass') {
            return encoderLike('computePass');
          }
          if (prop === 'finish') {
            return obj(kind === 'renderBundleEncoder' ? 'renderBundle' : 'commandBuffer', {});
          }
          return undefined;
        };
      },
    });
  };

  const device = {
    __kind: 'device',
    features: new Set<string>(),
    limits,
    lost: new Promise(() => {}),
    queue: {
      writeBuffer: (
        buffer: MockObject,
        offset: number,
        data: BufferSource,
        dataOffset?: number,
        size?: number,
      ) =>
        log.push({
          kind: 'queue.writeBuffer',
          id: buffer.__id,
          desc: { offset, bytes: bytesOf(data, dataOffset, size) },
        }),
      submit: (buffers: unknown[]) =>
        log.push({ kind: 'queue.submit', id: -1, desc: buffers.map(ref) }),
      onSubmittedWorkDone: async () => {},
    },
    addEventListener() {},
    pushErrorScope() {},
    popErrorScope: async () => null,
    destroy() {},
    createBuffer: (desc: GPUBufferDescriptor) => {
      const mapped = desc.mappedAtCreation ? new ArrayBuffer(desc.size) : undefined;
      const buffer = obj('buffer', desc, {
        size: desc.size,
        usage: desc.usage,
        mapState: mapped ? 'mapped' : 'unmapped',
        getMappedRange: () => mapped,
        unmap() {
          if (mapped) {
            log.push({
              kind: 'buffer.initialData',
              id: buffer.__id,
              desc: { offset: 0, bytes: bytesOf(mapped) },
            });
          }
        },
        destroy() {},
        mapAsync: async () => {},
      });
      return buffer;
    },
    createShaderModule: (desc: GPUShaderModuleDescriptor) =>
      obj('shaderModule', desc, { getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: (desc: unknown) => obj('bindGroupLayout', desc),
    createPipelineLayout: (desc: unknown) => obj('pipelineLayout', desc),
    createBindGroup: (desc: unknown) => obj('bindGroup', desc),
    createComputePipeline: (desc: unknown) => obj('computePipeline', desc),
    createRenderPipeline: (desc: unknown) => obj('renderPipeline', desc),
    createComputePipelineAsync: async (desc: unknown) => {
      log.push({ kind: 'device.createComputePipelineAsync', id: -1, desc: null });
      return obj('computePipeline', desc);
    },
    createRenderPipelineAsync: async (desc: unknown) => {
      log.push({ kind: 'device.createRenderPipelineAsync', id: -1, desc: null });
      return obj('renderPipeline', desc);
    },
    createSampler: (desc: unknown) => obj('sampler', desc),
    createCommandEncoder: () => encoderLike('commandEncoder'),
    createRenderBundleEncoder: (desc: unknown) => encoderLike('renderBundleEncoder', desc),
    createTexture: (desc: GPUTextureDescriptor) => {
      const texture: MockObject & object = obj('texture', desc, {
        format: desc.format,
        usage: desc.usage,
        createView: (viewDesc?: GPUTextureViewDescriptor) =>
          obj('textureView', { texture: ref(texture), ...viewDesc }),
        destroy() {
          log.push({ kind: 'texture.destroy', id: texture.__id, desc: null });
        },
      });
      return texture;
    },
  };

  const canvas = {
    width: 800,
    height: 600,
    getContext: () => ({
      configure: (config: unknown) =>
        log.push({ kind: 'context.configure', id: -1, desc: serialize(config) }),
      unconfigure() {},
      getCurrentTexture: () =>
        obj('canvasTexture', {}, { createView: () => obj('canvasView', {}), format: 'bgra8unorm' }),
    }),
  };

  let frames = 0;
  const maxFrames = options.frames ?? 2;
  Object.assign(globalThis, {
    GPUBufferUsage: {
      MAP_READ: 1,
      MAP_WRITE: 2,
      COPY_SRC: 4,
      COPY_DST: 8,
      INDEX: 16,
      VERTEX: 32,
      UNIFORM: 64,
      STORAGE: 128,
      INDIRECT: 256,
      QUERY_RESOLVE: 512,
    },
    GPUTextureUsage: {
      COPY_SRC: 1,
      COPY_DST: 2,
      TEXTURE_BINDING: 4,
      STORAGE_BINDING: 8,
      RENDER_ATTACHMENT: 16,
    },
    GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
    GPUMapMode: { READ: 1, WRITE: 2 },
    document: { querySelector: () => canvas, createElement: () => canvas },
    requestAnimationFrame: (callback: (time: number) => void) => {
      if (frames++ < maxFrames) {
        setTimeout(() => callback(16 * frames), 0);
      }
      return frames;
    },
    cancelAnimationFrame() {},
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      gpu: {
        requestAdapter: async () => ({
          features: new Set(),
          limits,
          info: {},
          requestDevice: async () => device,
        }),
        getPreferredCanvasFormat: () => 'bgra8unorm',
      },
    },
  });

  return log;
}

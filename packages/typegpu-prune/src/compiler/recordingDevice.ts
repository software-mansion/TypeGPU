/**
 * A `GPUDevice` stand-in that records what TypeGPU creates on it, without a GPU.
 * Lets `precompile()` arrows run at build time, in Node.
 */

export const $record = Symbol('typegpu-prune:record');

export interface Recorded<TDesc = unknown> {
  readonly [$record]: { readonly kind: string; readonly desc: TDesc };
}

export interface RecordedBuffer extends Recorded<GPUBufferDescriptor> {
  readonly size: number;
  readonly usage: number;
  /** Contents as written during the build: initial data and `queue.writeBuffer` calls */
  readonly shadow: Uint8Array;
}

export function recordOf<TDesc = Record<string, unknown>>(
  value: unknown,
): { kind: string; desc: TDesc } | undefined {
  return (value as Partial<Recorded<TDesc>> | undefined)?.[$record];
}

// Defaults from the WebGPU spec, so that TypeGPU validates against the limits every device has
const defaultLimits = {
  maxTextureDimension1D: 8192,
  maxTextureDimension2D: 8192,
  maxTextureDimension3D: 2048,
  maxTextureArrayLayers: 256,
  maxBindGroups: 4,
  maxBindGroupsPlusVertexBuffers: 24,
  maxBindingsPerBindGroup: 1000,
  maxDynamicUniformBuffersPerPipelineLayout: 8,
  maxDynamicStorageBuffersPerPipelineLayout: 4,
  maxSampledTexturesPerShaderStage: 16,
  maxSamplersPerShaderStage: 16,
  maxStorageBuffersPerShaderStage: 8,
  maxStorageTexturesPerShaderStage: 4,
  maxUniformBuffersPerShaderStage: 12,
  maxUniformBufferBindingSize: 65536,
  maxStorageBufferBindingSize: 134217728,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  maxVertexBuffers: 8,
  maxBufferSize: 268435456,
  maxVertexAttributes: 16,
  maxVertexBufferArrayStride: 2048,
  maxInterStageShaderVariables: 16,
  maxColorAttachments: 8,
  maxColorAttachmentBytesPerSample: 32,
  maxComputeWorkgroupStorageSize: 16384,
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupSizeX: 256,
  maxComputeWorkgroupSizeY: 256,
  maxComputeWorkgroupSizeZ: 64,
  maxComputeWorkgroupsPerDimension: 65535,
};

function record<T extends object>(kind: string, desc: unknown, extra: T): T & Recorded {
  return Object.assign(extra, { [$record]: { kind, desc } });
}

function notAtBuildTime(what: string): never {
  throw new Error(
    `[@typegpu/prune] ${what} can't run at build time. Precompiled arrows can only define resources and pipelines; ` +
      'run GPU work from the code that uses the result.',
  );
}

function toBytes(data: BufferSource | SharedArrayBuffer): Uint8Array {
  return ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
}

/** Sets the WebGPU constants TypeGPU reads, if the environment doesn't provide them */
export function installWebGPUGlobals(): void {
  const globals: Record<string, unknown> = {
    GPUBufferUsage: {
      MAP_READ: 0x1,
      MAP_WRITE: 0x2,
      COPY_SRC: 0x4,
      COPY_DST: 0x8,
      INDEX: 0x10,
      VERTEX: 0x20,
      UNIFORM: 0x40,
      STORAGE: 0x80,
      INDIRECT: 0x100,
      QUERY_RESOLVE: 0x200,
    },
    GPUTextureUsage: {
      COPY_SRC: 0x1,
      COPY_DST: 0x2,
      TEXTURE_BINDING: 0x4,
      STORAGE_BINDING: 0x8,
      RENDER_ATTACHMENT: 0x10,
    },
    GPUShaderStage: { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 },
    GPUMapMode: { READ: 0x1, WRITE: 0x2 },
    GPUColorWrite: { RED: 0x1, GREEN: 0x2, BLUE: 0x4, ALPHA: 0x8, ALL: 0xf },
  };
  for (const [name, value] of Object.entries(globals)) {
    if (!(name in globalThis)) {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
  }
}

export function createRecordingDevice(features: Iterable<string> = []): GPUDevice {
  const device = {
    label: 'typegpu-prune recording device',
    features: new Set(features),
    limits: { ...defaultLimits },
    adapterInfo: { vendor: '', architecture: '', device: '', description: 'typegpu-prune' },
    lost: new Promise(() => {}),
    queue: {
      label: '',
      writeBuffer(
        buffer: RecordedBuffer,
        offset: number,
        data: BufferSource | SharedArrayBuffer,
        dataOffset = 0,
        size?: number,
      ) {
        // For typed arrays, dataOffset and size are in elements
        const elementSize = ArrayBuffer.isView(data)
          ? ((data as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1)
          : 1;
        const bytes = toBytes(data);
        const start = dataOffset * elementSize;
        const end = size !== undefined ? start + size * elementSize : bytes.byteLength;
        buffer.shadow.set(bytes.subarray(start, end), offset);
      },
      submit: () => notAtBuildTime('Submitting GPU commands'),
      onSubmittedWorkDone: async () => {},
      writeTexture: () => notAtBuildTime('Writing textures'),
      copyExternalImageToTexture: () => notAtBuildTime('Copying images to textures'),
    },
    addEventListener() {},
    removeEventListener() {},
    pushErrorScope() {},
    popErrorScope: async () => null,
    destroy() {},

    createBuffer(desc: GPUBufferDescriptor) {
      const shadow = new Uint8Array(desc.size);
      let mapState: GPUBufferMapState = desc.mappedAtCreation ? 'mapped' : 'unmapped';
      const mappedRanges: [offset: number, range: ArrayBuffer][] = [];
      return record('buffer', desc, {
        shadow,
        size: desc.size,
        usage: desc.usage,
        label: desc.label ?? '',
        get mapState() {
          return mapState;
        },
        getMappedRange(offset = 0, size?: number) {
          const range = new ArrayBuffer(size ?? desc.size - offset);
          mappedRanges.push([offset, range]);
          return range;
        },
        unmap() {
          // Whatever was written into the mapped ranges becomes the recorded contents
          for (const [offset, range] of mappedRanges) {
            shadow.set(new Uint8Array(range), offset);
          }
          mappedRanges.length = 0;
          mapState = 'unmapped';
        },
        mapAsync: () => notAtBuildTime('Reading buffers'),
        destroy() {},
      });
    },
    createShaderModule: (desc: GPUShaderModuleDescriptor) =>
      record('shaderModule', desc, {
        label: desc.label ?? '',
        getCompilationInfo: async () => ({ messages: [] }),
      }),
    createBindGroupLayout: (desc: GPUBindGroupLayoutDescriptor) =>
      record('bindGroupLayout', desc, { label: desc.label ?? '' }),
    createPipelineLayout: (desc: GPUPipelineLayoutDescriptor) =>
      record('pipelineLayout', desc, { label: desc.label ?? '' }),
    createBindGroup: (desc: GPUBindGroupDescriptor) =>
      record('bindGroup', desc, { label: desc.label ?? '' }),
    createComputePipeline: (desc: GPUComputePipelineDescriptor) =>
      record('computePipeline', desc, {
        label: desc.label ?? '',
        getBindGroupLayout: () => notAtBuildTime('Reading auto layouts'),
      }),
    createRenderPipeline: (desc: GPURenderPipelineDescriptor) =>
      record('renderPipeline', desc, {
        label: desc.label ?? '',
        getBindGroupLayout: () => notAtBuildTime('Reading auto layouts'),
      }),
    async createComputePipelineAsync(desc: GPUComputePipelineDescriptor) {
      return device.createComputePipeline(desc);
    },
    async createRenderPipelineAsync(desc: GPURenderPipelineDescriptor) {
      return device.createRenderPipeline(desc);
    },
    createSampler: (desc: GPUSamplerDescriptor = {}) =>
      record('sampler', desc, { label: desc.label ?? '' }),
    createTexture: () => notAtBuildTime('Creating textures'),
    createQuerySet: () => notAtBuildTime('Creating query sets'),
    createCommandEncoder: () => notAtBuildTime('Encoding GPU commands'),
    createRenderBundleEncoder: () => notAtBuildTime('Encoding render bundles'),
    importExternalTexture: () => notAtBuildTime('Importing external textures'),
  };
  return device as unknown as GPUDevice;
}

/**
 * Stands in for the canvas format TypeGPU defaults color targets to. Replaced with
 * `navigator.gpu.getPreferredCanvasFormat()` by the pruned runtime.
 */
export const PREFERRED_FORMAT = '__typegpu_prune_preferred_canvas_format__';

/**
 * Installs a `navigator.gpu` whose `getPreferredCanvasFormat()` throws while the arrow runs,
 * since the canvas format is only known at runtime. Once the arrow is done, `allowPreferredFormat()`
 * makes it return `PREFERRED_FORMAT`, for TypeGPU to put in color targets without a format while
 * pipelines are serialized. It reports `wgslLanguageFeatures`, which TypeGPU checks before using
 * language extensions such as immediates. `restore()` brings back the original `navigator`.
 */
export function installRecordingNavigator(wgslLanguageFeatures: Iterable<string> = []): {
  allowPreferredFormat(): void;
  restore(): void;
} {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let allowed = false;
  const gpu = {
    getPreferredCanvasFormat() {
      if (!allowed) {
        throw new Error(
          "[@typegpu/prune] The canvas format is only known at runtime, so navigator.gpu.getPreferredCanvasFormat() can't be called in a precompile() arrow. " +
            'Leave the format out of the render pipeline targets, and the preferred canvas format is used at runtime.',
        );
      }
      return PREFERRED_FORMAT;
    },
    requestAdapter: () => notAtBuildTime('Requesting an adapter'),
    wgslLanguageFeatures: new Set<string>(wgslLanguageFeatures),
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    // Keeps whatever else the environment's navigator offers
    value: Object.create((globalThis as { navigator?: object }).navigator ?? Object.prototype, {
      gpu: { value: gpu, enumerable: true },
    }),
  });

  return {
    allowPreferredFormat() {
      allowed = true;
    },
    restore() {
      if (original) {
        Object.defineProperty(globalThis, 'navigator', original);
      } else {
        delete (globalThis as { navigator?: unknown }).navigator;
      }
    },
  };
}

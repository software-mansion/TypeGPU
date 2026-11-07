import type { Codec } from '../artifact.ts';

const usageFlags: Record<string, number> = {
  uniform: 0x40, // GPUBufferUsage.UNIFORM
  storage: 0x80, // GPUBufferUsage.STORAGE
  vertex: 0x20, // GPUBufferUsage.VERTEX
  index: 0x10, // GPUBufferUsage.INDEX
  indirect: 0x100, // GPUBufferUsage.INDIRECT
};

// GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
const COPY_SRC_DST = 0x4 | 0x8;

function isGPUBuffer(value: unknown): value is GPUBuffer {
  return typeof value === 'object' && value !== null && 'mapAsync' in value;
}

function isBufferSource(value: unknown): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

/**
 * A buffer of the pruned runtime. Mirrors the CPU-side API of `TgpuBuffer`,
 * moving values in and out through a codec generated at build time.
 */
export class PrunedBuffer {
  readonly root: PrunedRoot;
  readonly dataType: Codec;
  #flags: number;
  #initial: unknown;
  #raw: GPUBuffer | undefined;
  #host: DataView | undefined;

  constructor(root: PrunedRoot, dataType: Codec, initial?: unknown, flags = COPY_SRC_DST) {
    this.root = root;
    this.dataType = dataType;
    this.#flags = flags;
    if (isGPUBuffer(initial)) {
      this.#raw = initial;
    } else {
      this.#initial = initial;
    }
  }

  get size(): number {
    return this.#raw?.size ?? this.dataType.size;
  }

  $usage(...usages: string[]): this {
    for (const usage of usages) {
      this.#flags |= usageFlags[usage] ?? 0;
    }
    return this;
  }

  $addFlags(flags: GPUBufferUsageFlags): this {
    this.#flags |= flags;
    return this;
  }

  $name(_label: string): this {
    return this;
  }

  /** Bindings are only a matter of the bind group layout in the pruned runtime */
  as(_usage: string): this {
    return this;
  }

  unwrap(): GPUBuffer {
    if (!this.#raw) {
      const initial = this.#initial;
      this.#raw = this.root.device.createBuffer({
        size: this.dataType.size,
        usage: this.#flags,
        mappedAtCreation: initial !== undefined,
      });
      if (initial !== undefined) {
        const mapped = this.#raw.getMappedRange();
        if (isBufferSource(initial)) {
          new Uint8Array(mapped).set(toBytes(initial));
        } else {
          this.#writer()(new DataView(mapped), 0, initial);
        }
        this.#raw.unmap();
      }
      this.root._track(this);
    }
    return this.#raw;
  }

  get buffer(): GPUBuffer {
    return this.unwrap();
  }

  write(data: unknown): void {
    const raw = this.unwrap();
    if (isBufferSource(data)) {
      this.root.device.queue.writeBuffer(raw, 0, toBytes(data));
      return;
    }
    this.#host ??= new DataView(new ArrayBuffer(this.dataType.size));
    this.#writer()(this.#host, 0, data);
    this.root.device.queue.writeBuffer(raw, 0, this.#host.buffer);
  }

  async read(): Promise<unknown> {
    const read = this.dataType.read;
    if (!read) {
      throw new Error('[@typegpu/prune] This schema has no precompiled reader.');
    }
    const raw = this.unwrap();
    const device = this.root.device;
    const staging = device.createBuffer({ size: raw.size, usage: 0x1 | 0x8 }); // MAP_READ | COPY_DST
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(raw, 0, staging, 0, raw.size);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(0x1); // GPUMapMode.READ
    const result = read(new DataView(staging.getMappedRange().slice(0)), 0);
    staging.destroy();
    return result;
  }

  destroy(): void {
    this.#raw?.destroy();
    this.#raw = undefined;
  }

  #writer() {
    const write = this.dataType.write;
    if (!write) {
      throw new Error('[@typegpu/prune] This schema has no precompiled writer.');
    }
    return write;
  }
}

function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export class PrunedLayout {
  readonly keys: (string | null)[];
  readonly entries: GPUBindGroupLayoutEntry[];

  constructor(keys: (string | null)[], entries: GPUBindGroupLayoutEntry[]) {
    this.keys = keys;
    this.entries = entries;
  }

  $name(_label: string): this {
    return this;
  }
}

export class PrunedVertexLayout {
  readonly stride: number;
  readonly stepMode: GPUVertexStepMode;

  constructor(stride: number, stepMode: GPUVertexStepMode) {
    this.stride = stride;
    this.stepMode = stepMode;
  }
}

type Unwrappable = { unwrap(): unknown };

function toResource(value: unknown): GPUBindingResource {
  if (value instanceof PrunedBuffer) {
    return { buffer: value.unwrap() };
  }
  if (isGPUBuffer(value)) {
    return { buffer: value };
  }
  if (typeof value === 'object' && value !== null && 'unwrap' in value) {
    return (value as Unwrappable).unwrap() as GPUBindingResource;
  }
  return value as GPUBindingResource;
}

export class PrunedBindGroup {
  readonly root: PrunedRoot;
  readonly layout: PrunedLayout;
  readonly #entries: Record<string, unknown> | (() => GPUBindGroupEntry[]);
  #raw: GPUBindGroup | undefined;

  constructor(
    root: PrunedRoot,
    layout: PrunedLayout,
    entries: Record<string, unknown> | (() => GPUBindGroupEntry[]),
  ) {
    this.root = root;
    this.layout = layout;
    this.#entries = entries;
  }

  unwrap(): GPUBindGroup {
    if (!this.#raw) {
      const entries = this.#entries;
      this.#raw = this.root.device.createBindGroup({
        layout: this.root.unwrapLayout(this.layout),
        entries:
          typeof entries === 'function'
            ? entries()
            : this.layout.keys.flatMap((key, binding) => {
                if (key === null) {
                  return [];
                }
                if (!(key in entries)) {
                  throw new Error(`[@typegpu/prune] Missing bind group entry '${key}'.`);
                }
                return [{ binding, resource: toResource(entries[key]) }];
              }),
      });
    }
    return this.#raw;
  }
}

/** What a render pass attachment can be given as: a canvas context, a texture or a view */
export type AttachmentView = GPUCanvasContext | GPUTexture | GPUTextureView;

export function toView(view: AttachmentView): GPUTextureView {
  if ('getCurrentTexture' in view) {
    return view.getCurrentTexture().createView();
  }
  if ('createView' in view) {
    return view.createView();
  }
  return view;
}

export interface PrunedColorAttachment extends Omit<
  GPURenderPassColorAttachment,
  'view' | 'resolveTarget' | 'loadOp' | 'storeOp'
> {
  view: AttachmentView;
  resolveTarget?: AttachmentView | undefined;
  loadOp?: GPULoadOp | undefined;
  storeOp?: GPUStoreOp | undefined;
}

export interface PrunedDepthStencilAttachment extends Omit<
  GPURenderPassDepthStencilAttachment,
  'view'
> {
  view: GPUTexture | GPUTextureView;
}

export interface PrunedRenderPassDescriptor extends Omit<
  GPURenderPassDescriptor,
  'colorAttachments' | 'depthStencilAttachment'
> {
  colorAttachments?: PrunedColorAttachment | readonly (PrunedColorAttachment | null)[] | undefined;
  depthStencilAttachment?: PrunedDepthStencilAttachment | undefined;
}

/**
 * The stencil reference of each render pass begun by a `PrunedCommandEncoder`. Pipelines reset
 * the stencil reference of a pass only when it isn't known to be the default already, as
 * TypeGPU does for its own passes.
 */
export const stencilReferences = new WeakMap<GPURenderPassEncoder, GPUStencilValue>();

/**
 * Mirrors `TgpuCommandEncoder`: batches passes, and the draws and dispatches that pipelines
 * record into them with `.with(pass)`, into a single submission. Its passes are the raw
 * WebGPU ones, with attachments given the way TypeGPU takes them.
 */
export class PrunedCommandEncoder {
  readonly resourceType = 'command-encoder';
  readonly root: PrunedRoot;
  readonly #raw: GPUCommandEncoder;

  constructor(root: PrunedRoot, raw: GPUCommandEncoder) {
    this.root = root;
    this.#raw = raw;
  }

  unwrap(): GPUCommandEncoder {
    return this.#raw;
  }

  beginRenderPass(descriptor: PrunedRenderPassDescriptor): GPURenderPassEncoder {
    const { colorAttachments, depthStencilAttachment: depth, ...rest } = descriptor;
    const colors = colorAttachments === undefined ? [] : [colorAttachments].flat();
    const pass = this.#raw.beginRenderPass({
      ...rest,
      colorAttachments: colors.map((color) => {
        if (color === null) {
          return null;
        }
        const { resolveTarget, ...rest } = color;
        return {
          ...rest,
          loadOp: color.loadOp ?? 'clear',
          storeOp: color.storeOp ?? 'store',
          view: toView(color.view),
          ...(resolveTarget !== undefined && { resolveTarget: toView(resolveTarget) }),
        };
      }),
      ...(depth && {
        depthStencilAttachment: {
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
          depthClearValue: 1,
          ...depth,
          view: toView(depth.view),
        },
      }),
    });
    stencilReferences.set(pass, 0);
    const setStencilReference = pass.setStencilReference.bind(pass);
    pass.setStencilReference = (reference) => {
      stencilReferences.set(pass, reference);
      setStencilReference(reference);
    };
    return pass;
  }

  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder {
    return this.#raw.beginComputePass(descriptor);
  }

  /** Finishes the recording and submits it to the device queue */
  submit(): void {
    this.root.device.queue.submit([this.#raw.finish()]);
  }

  /** Finishes the recording without submitting it */
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer {
    return this.#raw.finish(descriptor);
  }
}

export interface ConfigureContextOptions extends Omit<GPUCanvasConfiguration, 'device' | 'format'> {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  format?: GPUTextureFormat | undefined;
}

/**
 * The root of the pruned runtime. Mirrors the subset of `TgpuRoot` that
 * works on precompiled objects.
 */
export class PrunedRoot {
  readonly device: GPUDevice;
  readonly #ownsDevice: boolean;
  readonly #buffers = new Set<PrunedBuffer>();
  readonly #layouts = new Map<PrunedLayout, GPUBindGroupLayout>();

  constructor(device: GPUDevice, ownsDevice: boolean) {
    this.device = device;
    this.#ownsDevice = ownsDevice;
  }

  createBuffer(dataType: Codec, initial?: unknown): PrunedBuffer {
    return new PrunedBuffer(this, dataType, initial);
  }

  createUniform(dataType: Codec, initial?: unknown): PrunedBuffer {
    return this.createBuffer(dataType, initial).$usage('uniform');
  }

  createMutable(dataType: Codec, initial?: unknown): PrunedBuffer {
    return this.createBuffer(dataType, initial).$usage('storage');
  }

  createReadonly(dataType: Codec, initial?: unknown): PrunedBuffer {
    return this.createBuffer(dataType, initial).$usage('storage');
  }

  createBindGroup(layout: PrunedLayout, entries: Record<string, unknown>): PrunedBindGroup {
    return new PrunedBindGroup(this, layout, entries);
  }

  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): PrunedCommandEncoder {
    return new PrunedCommandEncoder(this, this.device.createCommandEncoder(descriptor));
  }

  configureContext(options: ConfigureContextOptions): GPUCanvasContext {
    const context = options.canvas.getContext('webgpu');
    if (!context) {
      throw new Error("Unable to initialize 'webgpu' context on the provided canvas.");
    }
    const { canvas: _, ...config } = options;
    context.configure({
      ...config,
      device: this.device,
      format: options.format ?? navigator.gpu.getPreferredCanvasFormat(),
    });
    return context;
  }

  unwrapLayout(layout: PrunedLayout): GPUBindGroupLayout {
    let raw = this.#layouts.get(layout);
    if (!raw) {
      raw = this.device.createBindGroupLayout({ entries: layout.entries });
      this.#layouts.set(layout, raw);
    }
    return raw;
  }

  unwrap(resource: Unwrappable | PrunedLayout): unknown {
    return resource instanceof PrunedLayout ? this.unwrapLayout(resource) : resource.unwrap();
  }

  /** @internal */
  _track(buffer: PrunedBuffer): void {
    this.#buffers.add(buffer);
  }

  destroy(): void {
    for (const buffer of this.#buffers) {
      buffer.destroy();
    }
    this.#buffers.clear();
    if (this.#ownsDevice) {
      this.device.destroy();
    }
  }
}

export async function init(options?: {
  adapter?: GPURequestAdapterOptions | undefined;
  device?: GPUDeviceDescriptor | undefined;
}): Promise<PrunedRoot> {
  const adapter = await navigator.gpu.requestAdapter(options?.adapter);
  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }
  return new PrunedRoot(await adapter.requestDevice(options?.device), true);
}

export function initFromDevice(options: { device: GPUDevice }): PrunedRoot {
  return new PrunedRoot(options.device, false);
}

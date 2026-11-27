import type {
  ComputePipelineArtifact,
  GroupArtifact,
  RenderPipelineArtifact,
} from '../artifact.ts';
import {
  PrunedBindGroup,
  PrunedCommandEncoder,
  type PrunedBuffer,
  type PrunedLayout,
  PrunedVertexLayout,
  type PrunedColorAttachment,
  type PrunedDepthStencilAttachment,
  type PrunedRoot,
  stencilReferences,
  toView,
} from './root.ts';

/** What a pipeline needs from the attach context that created it */
export interface PipelineHost {
  readonly root: PrunedRoot;
  shaderModule(id: number): GPUShaderModule;
  layoutObject(id: number): PrunedLayout;
  bindGroup(id: number): PrunedBindGroup;
  buffer(id: number): PrunedBuffer;
  vertexLayout(id: number): PrunedVertexLayout;
}

type BindGroupLike = PrunedBindGroup | GPUBindGroup;

/** A raw pipeline shared by every pipeline derived with `.with()`, and its pending async creation */
interface PipelineCache<T> {
  raw?: T;
  pending?: Promise<void> | undefined;
}
type BoundGroups = Map<PrunedLayout, BindGroupLike>;

function createPipelineLayout(host: PipelineHost, groups: (GroupArtifact | null)[]) {
  const { root } = host;
  return root.device.createPipelineLayout({
    bindGroupLayouts: groups.map((group) =>
      group
        ? root.unwrapLayout(host.layoutObject(group.layout))
        : root.device.createBindGroupLayout({ entries: [] }),
    ),
  });
}

/** What render pipelines record into: a pass, or a render bundle */
type RenderCommands = GPURenderPassEncoder | GPURenderBundleEncoder;

function setBindGroups(
  host: PipelineHost,
  pass: GPUComputePassEncoder | RenderCommands,
  groups: (GroupArtifact | null)[],
  bound: BoundGroups,
) {
  groups.forEach((group, idx) => {
    if (!group) {
      return;
    }
    const layout = host.layoutObject(group.layout);
    const bindGroup =
      bound.get(layout) ??
      (group.bindGroup !== undefined ? host.bindGroup(group.bindGroup) : undefined);
    if (!bindGroup) {
      throw new Error(`[@typegpu/prune] Missing bind group for group index ${idx}.`);
    }
    pass.setBindGroup(idx, 'unwrap' in bindGroup ? bindGroup.unwrap() : bindGroup);
  });
}

function withBindGroup(bound: BoundGroups, bindGroup: PrunedBindGroup): BoundGroups {
  return new Map(bound).set(bindGroup.layout, bindGroup);
}

function unsupportedWith(): never {
  throw new Error('Unsupported value passed into .with()');
}

/** As in TypeGPU, a pipeline is not created synchronously while its async creation is pending */
function createOnce<T>(cache: PipelineCache<T>, create: () => T): T {
  if (cache.raw === undefined) {
    if (cache.pending !== undefined) {
      throw new Error("'pipeline.initAsync()' was called and is not yet resolved.");
    }
    cache.raw = create();
  }
  return cache.raw;
}

/** As in TypeGPU, a failed creation is forgotten, so that a later `initAsync()` retries it */
function createAsyncOnce<T>(cache: PipelineCache<T>, create: () => Promise<T>): Promise<void> {
  if (cache.raw !== undefined) {
    return Promise.resolve();
  }
  cache.pending ??= create()
    .then((raw) => {
      cache.raw ??= raw;
    })
    .finally(() => {
      cache.pending = undefined;
    });
  return cache.pending;
}

function unwrapEncoder(encoder: GPUCommandEncoder | PrunedCommandEncoder): GPUCommandEncoder {
  return encoder instanceof PrunedCommandEncoder ? encoder.unwrap() : encoder;
}

/** Where a compute pipeline records its dispatches, as set with `.with(pass)` or `.with(encoder)` */
interface ComputeTarget {
  readonly pass?: GPUComputePassEncoder | undefined;
  readonly encoder?: GPUCommandEncoder | undefined;
}

function isComputePass(value: unknown): value is GPUComputePassEncoder {
  const maybe = value as { dispatchWorkgroups?: unknown; beginRenderPass?: unknown } | null;
  return (
    typeof maybe?.dispatchWorkgroups === 'function' &&
    maybe.beginRenderPass === undefined &&
    !(value instanceof PrunedComputePipeline)
  );
}

function isCommandEncoder(value: unknown): value is GPUCommandEncoder {
  const maybe = value as { beginComputePass?: unknown; beginRenderPass?: unknown } | null;
  return (
    typeof maybe?.beginComputePass === 'function' && typeof maybe.beginRenderPass === 'function'
  );
}

export class PrunedComputePipeline {
  readonly resourceType = 'compute-pipeline';
  readonly #host: PipelineHost;
  readonly #art: ComputePipelineArtifact;
  readonly #bound: BoundGroups;
  readonly #cache: PipelineCache<GPUComputePipeline>;
  readonly #target: ComputeTarget;

  constructor(
    host: PipelineHost,
    art: ComputePipelineArtifact,
    bound: BoundGroups = new Map(),
    cache: PipelineCache<GPUComputePipeline> = {},
    target: ComputeTarget = {},
  ) {
    this.#host = host;
    this.#art = art;
    this.#bound = bound;
    this.#cache = cache;
    this.#target = target;
  }

  #descriptor(): GPUComputePipelineDescriptor {
    const host = this.#host;
    return {
      layout: createPipelineLayout(host, this.#art.groups),
      compute: {
        module: host.shaderModule(this.#art.shader),
        ...(this.#art.entryPoint !== undefined && { entryPoint: this.#art.entryPoint }),
      },
    };
  }

  unwrap(): GPUComputePipeline {
    return createOnce(this.#cache, () =>
      this.#host.root.device.createComputePipeline(this.#descriptor()),
    );
  }

  /**
   * Creates the pipeline without blocking, as in TypeGPU, so that the first dispatch doesn't
   * compile its shader. Not necessary to call.
   */
  initAsync(): Promise<void> {
    return createAsyncOnce(this.#cache, () =>
      this.#host.root.device.createComputePipelineAsync(this.#descriptor()),
    );
  }

  /** Creates the pipeline now, as in TypeGPU. Not necessary to call. */
  initSync(): void {
    this.unwrap();
  }

  /**
   * Binds a bind group, or, as in TypeGPU, records later dispatches into an existing
   * compute pass or command encoder instead of submitting them on their own.
   */
  with(
    target: PrunedBindGroup | GPUComputePassEncoder | GPUCommandEncoder | PrunedCommandEncoder,
  ): PrunedComputePipeline {
    if (target instanceof PrunedBindGroup) {
      return this.#derive(withBindGroup(this.#bound, target), this.#target);
    }
    if (target instanceof PrunedCommandEncoder || isCommandEncoder(target)) {
      return this.#derive(this.#bound, { encoder: unwrapEncoder(target) });
    }
    if (isComputePass(target)) {
      return this.#derive(this.#bound, { pass: target });
    }
    return unsupportedWith();
  }

  #derive(bound: BoundGroups, target: ComputeTarget): PrunedComputePipeline {
    return new PrunedComputePipeline(this.#host, this.#art, bound, this.#cache, target);
  }

  dispatchWorkgroups(x: number, y = 1, z = 1): void {
    const { pass: sharedPass, encoder: sharedEncoder } = this.#target;
    if (sharedPass) {
      this.#record(sharedPass, x, y, z);
      return;
    }
    const device = this.#host.root.device;
    const encoder = sharedEncoder ?? device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    this.#record(pass, x, y, z);
    pass.end();
    if (!sharedEncoder) {
      device.queue.submit([encoder.finish()]);
    }
  }

  #record(pass: GPUComputePassEncoder, x: number, y: number, z: number): void {
    pass.setPipeline(this.unwrap());
    setBindGroups(this.#host, pass, this.#art.groups, this.#bound);
    pass.dispatchWorkgroups(x, y, z);
  }
}

export class PrunedGuardedComputePipeline {
  readonly resourceType = 'guarded-compute-pipeline';
  readonly #pipeline: PrunedComputePipeline;
  readonly #sizeBuffer: PrunedBuffer;
  readonly #workgroupSize: [number, number, number];
  readonly #last: number[];

  constructor(
    pipeline: PrunedComputePipeline,
    sizeBuffer: PrunedBuffer,
    workgroupSize: [number, number, number],
    last: number[] = [],
  ) {
    this.#pipeline = pipeline;
    this.#sizeBuffer = sizeBuffer;
    this.#workgroupSize = workgroupSize;
    this.#last = last;
  }

  get pipeline(): PrunedComputePipeline {
    return this.#pipeline;
  }

  initAsync(): Promise<void> {
    return this.#pipeline.initAsync();
  }

  initSync(): void {
    this.#pipeline.initSync();
  }

  /**
   * Binds a bind group. As in TypeGPU, guarded pipelines can't record into a pass or encoder:
   * every dispatch writes the size uniform right away, so dispatches recorded together would
   * all see the size of the last one.
   */
  with(target: PrunedBindGroup): PrunedGuardedComputePipeline {
    if (!(target instanceof PrunedBindGroup)) {
      throw new Error(
        'Guarded pipelines only accept bind groups in .with(). To record into passes or encoders, use a regular compute pipeline.',
      );
    }
    return new PrunedGuardedComputePipeline(
      this.#pipeline.with(target),
      this.#sizeBuffer,
      this.#workgroupSize,
      this.#last,
    );
  }

  dispatchThreads(x = 1, y = 1, z = 1): void {
    const last = this.#last;
    if (last[0] !== x || last[1] !== y || last[2] !== z) {
      this.#sizeBuffer.write(new Uint32Array([x, y, z]));
      last.splice(0, 3, x, y, z);
    }
    const [wx, wy, wz] = this.#workgroupSize;
    this.#pipeline.dispatchWorkgroups(Math.ceil(x / wx), Math.ceil(y / wy), Math.ceil(z / wz));
  }
}

type ColorAttachment = PrunedColorAttachment;
type DepthStencilAttachment = PrunedDepthStencilAttachment;

interface RenderState {
  bound: BoundGroups;
  vertexBuffers: Map<PrunedVertexLayout, PrunedBuffer | GPUBuffer>;
  color?: ColorAttachment | ColorAttachment[] | undefined;
  depthStencil?: DepthStencilAttachment | undefined;
  index?: { buffer: PrunedBuffer | GPUBuffer; format: GPUIndexFormat } | undefined;
  /** Set with `.with(pass)` or `.with(bundleEncoder)`: draws record into it */
  commands?: RenderCommands | undefined;
  /** Set with `.with(encoder)`: draws begin their pass on it, and nothing is submitted */
  encoder?: GPUCommandEncoder | undefined;
}

function isRenderPass(commands: RenderCommands): commands is GPURenderPassEncoder {
  return typeof (commands as Partial<GPURenderPassEncoder>).setStencilReference === 'function';
}

function isRenderCommands(value: unknown): value is RenderCommands {
  const maybe = value as { draw?: unknown; beginRenderPass?: unknown } | null;
  return (
    typeof maybe?.draw === 'function' &&
    maybe.beginRenderPass === undefined &&
    !(value instanceof PrunedRenderPipeline)
  );
}

function toGPUBuffer(buffer: PrunedBuffer | GPUBuffer): GPUBuffer {
  return 'unwrap' in buffer ? buffer.unwrap() : buffer;
}

function withPreferredFormat(
  art: RenderPipelineArtifact,
  fragment: Omit<GPUFragmentState, 'module'>,
): (GPUColorTargetState | null)[] {
  const targets = [...fragment.targets];
  const indices = art.preferredFormatTargets ?? [];
  const format = indices.length > 0 ? navigator.gpu.getPreferredCanvasFormat() : undefined;
  for (const idx of indices) {
    targets[idx] = { ...targets[idx], format: format as GPUTextureFormat };
  }
  return targets;
}

export class PrunedRenderPipeline {
  readonly resourceType = 'render-pipeline';
  readonly #host: PipelineHost;
  readonly #art: RenderPipelineArtifact;
  readonly #state: RenderState;
  readonly #cache: PipelineCache<GPURenderPipeline>;

  constructor(
    host: PipelineHost,
    art: RenderPipelineArtifact,
    state?: RenderState,
    cache: PipelineCache<GPURenderPipeline> = {},
  ) {
    this.#host = host;
    this.#art = art;
    this.#state = state ?? {
      bound: new Map(),
      vertexBuffers: new Map(
        art.vertexBuffers.map(([layout, buffer]) => [
          host.vertexLayout(layout),
          host.buffer(buffer),
        ]),
      ),
    };
    this.#cache = cache;
  }

  #derive(patch: Partial<RenderState>): PrunedRenderPipeline {
    return new PrunedRenderPipeline(
      this.#host,
      this.#art,
      { ...this.#state, ...patch },
      this.#cache,
    );
  }

  #descriptor(): GPURenderPipelineDescriptor {
    const host = this.#host;
    const module = host.shaderModule(this.#art.shader);
    const { vertex, fragment, ...rest } = this.#art.descriptor;
    return {
      ...rest,
      layout: createPipelineLayout(host, this.#art.groups),
      vertex: { ...vertex, module },
      ...(fragment && {
        fragment: { ...fragment, module, targets: withPreferredFormat(this.#art, fragment) },
      }),
    };
  }

  unwrap(): GPURenderPipeline {
    return createOnce(this.#cache, () =>
      this.#host.root.device.createRenderPipeline(this.#descriptor()),
    );
  }

  /** As `PrunedComputePipeline.initAsync()` */
  initAsync(): Promise<void> {
    return createAsyncOnce(this.#cache, () =>
      this.#host.root.device.createRenderPipelineAsync(this.#descriptor()),
    );
  }

  /** Creates the pipeline now, as in TypeGPU. Not necessary to call. */
  initSync(): void {
    this.unwrap();
  }

  /**
   * Binds a bind group or a vertex buffer, or, as in TypeGPU, records draws into an existing
   * render pass, render bundle or command encoder instead of submitting them on their own.
   */
  with(
    target:
      | PrunedBindGroup
      | PrunedVertexLayout
      | GPUCommandEncoder
      | PrunedCommandEncoder
      | GPURenderPassEncoder
      | GPURenderBundleEncoder,
    buffer?: PrunedBuffer | GPUBuffer,
  ): PrunedRenderPipeline {
    if (target instanceof PrunedBindGroup) {
      return this.#derive({ bound: withBindGroup(this.#state.bound, target) });
    }
    if (target instanceof PrunedVertexLayout) {
      if (!buffer) {
        throw new Error('[@typegpu/prune] Missing vertex buffer.');
      }
      return this.#derive({
        vertexBuffers: new Map(this.#state.vertexBuffers).set(target, buffer),
      });
    }
    if (target instanceof PrunedCommandEncoder || isCommandEncoder(target)) {
      return this.#derive({ encoder: unwrapEncoder(target), commands: undefined });
    }
    if (isRenderCommands(target)) {
      return this.#derive({ commands: target, encoder: undefined });
    }
    return unsupportedWith();
  }

  withColorAttachment(color: ColorAttachment | ColorAttachment[]): PrunedRenderPipeline {
    return this.#derive({ color });
  }

  withDepthStencilAttachment(depthStencil: DepthStencilAttachment): PrunedRenderPipeline {
    return this.#derive({ depthStencil });
  }

  withIndexBuffer(
    buffer: PrunedBuffer | GPUBuffer,
    format: GPUIndexFormat = 'uint32',
  ): PrunedRenderPipeline {
    return this.#derive({ index: { buffer, format } });
  }

  #pass(record: (pass: RenderCommands) => void): void {
    const state = this.#state;
    if (state.commands) {
      this.#record(state.commands, record);
      return;
    }
    const device = this.#host.root.device;
    const colors = state.color === undefined ? [] : [state.color].flat();
    const depth = state.depthStencil;

    const encoder = state.encoder ?? device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: colors.map(({ resolveTarget, ...color }) => ({
        ...color,
        loadOp: color.loadOp ?? 'clear',
        storeOp: color.storeOp ?? 'store',
        view: toView(color.view),
        ...(resolveTarget !== undefined && { resolveTarget: toView(resolveTarget) }),
      })),
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
    this.#record(pass, record);
    pass.end();
    if (!state.encoder) {
      device.queue.submit([encoder.finish()]);
    }
  }

  #record(pass: RenderCommands, record: (pass: RenderCommands) => void): void {
    const host = this.#host;
    const state = this.#state;
    pass.setPipeline(this.unwrap());
    setBindGroups(host, pass, this.#art.groups, state.bound);
    this.#art.vertexSlots.forEach((layoutId, slot) => {
      const buffer = state.vertexBuffers.get(host.vertexLayout(layoutId));
      if (!buffer) {
        throw new Error(`[@typegpu/prune] Missing vertex buffer for slot ${slot}.`);
      }
      pass.setVertexBuffer(slot, toGPUBuffer(buffer));
    });
    if (state.index) {
      pass.setIndexBuffer(toGPUBuffer(state.index.buffer), state.index.format);
    }
    // A pass the app began may hold any stencil reference, so it is reset to the default, as in
    // TypeGPU. A pass begun here, or on root.createCommandEncoder(), is known to be at it.
    if (pass === state.commands && isRenderPass(pass) && stencilReferences.get(pass) !== 0) {
      pass.setStencilReference(0);
    }
    record(pass);
  }

  draw(vertexCount: number, instanceCount = 1, firstVertex = 0, firstInstance = 0): void {
    this.#pass((pass) => pass.draw(vertexCount, instanceCount, firstVertex, firstInstance));
  }

  drawIndexed(
    indexCount: number,
    instanceCount = 1,
    firstIndex = 0,
    baseVertex = 0,
    firstInstance = 0,
  ): void {
    if (!this.#state.index) {
      throw new Error(
        '[@typegpu/prune] drawIndexed() needs an index buffer, see withIndexBuffer().',
      );
    }
    this.#pass((pass) =>
      pass.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance),
    );
  }
}

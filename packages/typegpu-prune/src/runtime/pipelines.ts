import type {
  ComputePipelineArtifact,
  GroupArtifact,
  RenderPipelineArtifact,
} from '../artifact.ts';
import {
  type PrunedBindGroup,
  type PrunedBuffer,
  type PrunedLayout,
  PrunedVertexLayout,
  type PrunedRoot,
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

function setBindGroups(
  host: PipelineHost,
  pass: GPUComputePassEncoder | GPURenderPassEncoder,
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

export class PrunedComputePipeline {
  readonly resourceType = 'compute-pipeline';
  readonly #host: PipelineHost;
  readonly #art: ComputePipelineArtifact;
  readonly #bound: BoundGroups;
  readonly #cache: { raw?: GPUComputePipeline };

  constructor(
    host: PipelineHost,
    art: ComputePipelineArtifact,
    bound: BoundGroups = new Map(),
    cache: { raw?: GPUComputePipeline } = {},
  ) {
    this.#host = host;
    this.#art = art;
    this.#bound = bound;
    this.#cache = cache;
  }

  unwrap(): GPUComputePipeline {
    const host = this.#host;
    this.#cache.raw ??= host.root.device.createComputePipeline({
      layout: createPipelineLayout(host, this.#art.groups),
      compute: {
        module: host.shaderModule(this.#art.shader),
        ...(this.#art.entryPoint !== undefined && { entryPoint: this.#art.entryPoint }),
      },
    });
    return this.#cache.raw;
  }

  with(bindGroup: PrunedBindGroup): PrunedComputePipeline {
    return new PrunedComputePipeline(
      this.#host,
      this.#art,
      withBindGroup(this.#bound, bindGroup),
      this.#cache,
    );
  }

  dispatchWorkgroups(x: number, y = 1, z = 1): void {
    const device = this.#host.root.device;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.unwrap());
    setBindGroups(this.#host, pass, this.#art.groups, this.#bound);
    pass.dispatchWorkgroups(x, y, z);
    pass.end();
    device.queue.submit([encoder.finish()]);
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

  with(bindGroup: PrunedBindGroup): PrunedGuardedComputePipeline {
    return new PrunedGuardedComputePipeline(
      this.#pipeline.with(bindGroup),
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

interface ColorAttachment extends Omit<
  GPURenderPassColorAttachment,
  'view' | 'loadOp' | 'storeOp'
> {
  view: GPUCanvasContext | GPUTexture | GPUTextureView;
  loadOp?: GPULoadOp | undefined;
  storeOp?: GPUStoreOp | undefined;
}

interface DepthStencilAttachment extends Omit<GPURenderPassDepthStencilAttachment, 'view'> {
  view: GPUTexture | GPUTextureView;
}

interface RenderState {
  bound: BoundGroups;
  vertexBuffers: Map<PrunedVertexLayout, PrunedBuffer | GPUBuffer>;
  color?: ColorAttachment | ColorAttachment[] | undefined;
  depthStencil?: DepthStencilAttachment | undefined;
  index?: { buffer: PrunedBuffer | GPUBuffer; format: GPUIndexFormat } | undefined;
}

function toView(view: GPUCanvasContext | GPUTexture | GPUTextureView): GPUTextureView {
  if ('getCurrentTexture' in view) {
    return view.getCurrentTexture().createView();
  }
  if ('createView' in view) {
    return view.createView();
  }
  return view;
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
  readonly #cache: { raw?: GPURenderPipeline };

  constructor(
    host: PipelineHost,
    art: RenderPipelineArtifact,
    state?: RenderState,
    cache: { raw?: GPURenderPipeline } = {},
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

  unwrap(): GPURenderPipeline {
    const host = this.#host;
    if (!this.#cache.raw) {
      const module = host.shaderModule(this.#art.shader);
      const { vertex, fragment, ...rest } = this.#art.descriptor;
      this.#cache.raw = host.root.device.createRenderPipeline({
        ...rest,
        layout: createPipelineLayout(host, this.#art.groups),
        vertex: { ...vertex, module },
        ...(fragment && {
          fragment: { ...fragment, module, targets: withPreferredFormat(this.#art, fragment) },
        }),
      });
    }
    return this.#cache.raw;
  }

  with(
    target: PrunedBindGroup | PrunedVertexLayout,
    buffer?: PrunedBuffer | GPUBuffer,
  ): PrunedRenderPipeline {
    if (target instanceof PrunedVertexLayout) {
      if (!buffer) {
        throw new Error('[@typegpu/prune] Missing vertex buffer.');
      }
      return this.#derive({
        vertexBuffers: new Map(this.#state.vertexBuffers).set(target, buffer),
      });
    }
    return this.#derive({ bound: withBindGroup(this.#state.bound, target) });
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

  #pass(record: (pass: GPURenderPassEncoder) => void): void {
    const host = this.#host;
    const device = host.root.device;
    const state = this.#state;
    const colors = state.color === undefined ? [] : [state.color].flat();
    const depth = state.depthStencil;

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: colors.map((color) => ({
        ...color,
        loadOp: color.loadOp ?? 'clear',
        storeOp: color.storeOp ?? 'store',
        view: toView(color.view),
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
    record(pass);
    pass.end();
    device.queue.submit([encoder.finish()]);
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

import type { Disarray } from '../../data/dataTypes.ts';
import type { WgslArray } from '../../data/wgslTypes.ts';
import { $internal } from '../../shared/symbols.ts';
import {
  isBindGroup,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import type { TgpuBuffer, VertexFlag } from '../buffer/buffer.ts';
import { isTexture, isTextureView } from '../texture/texture.ts';
import { emitRenderDraw, RenderDrawState } from '../pipeline/drawState.ts';
import type { ColorAttachment, DepthStencilAttachment } from '../pipeline/renderPipeline.ts';
import type { TgpuRenderPipeline } from '../pipeline/renderPipeline.ts';
import { isQuerySet, type TgpuQuerySet } from '../querySet/querySet.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuCommandEncoder } from './commandEncoder.ts';
import type { TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import {
  type TgpuPassTimestampWrites,
  unwrapAttachmentView,
  unwrapTimestampWrites,
} from './attachments.ts';

// ----------
// Public API
// ----------

/**
 * The TypeGPU equivalent of {@link GPURenderPassDescriptor}. Attachment views accept
 * TypeGPU textures, texture views and canvas contexts (next to raw {@link GPUTextureView}s),
 * and query sets accept {@link TgpuQuerySet}.
 *
 * Load/store operations default to `loadOp: 'clear'`, `storeOp: 'store'`
 * (and `depthClearValue: 1` for depth attachments). For depth/stencil attachments,
 * defaults are derived from the view's format and aspect. A raw {@link GPUTextureView}
 * with no explicit operations is assumed to be depth-only; provide explicit
 * operations for raw stencil or depth-stencil views.
 */
export interface TgpuRenderPassDescriptor {
  label?: string | undefined;
  colorAttachments?: ColorAttachment | readonly (ColorAttachment | null)[] | undefined;
  depthStencilAttachment?: DepthStencilAttachment | undefined;
  occlusionQuerySet?: TgpuQuerySet<'occlusion'> | GPUQuerySet | undefined;
  timestampWrites?: TgpuPassTimestampWrites | undefined;
  maxDrawCount?: number | undefined;
}

export interface RenderPassInternals<
  TRaw extends GPURenderPassEncoder | GPURenderBundleEncoder =
    | GPURenderPassEncoder
    | GPURenderBundleEncoder,
> {
  readonly rawPass: TRaw;
  readonly state: RenderDrawState;
  /**
   * The encoder this pass records into, when it is one we can defer work to.
   * Undefined for bundle encoders and for raw pass encoders the caller owns.
   */
  readonly owner: TgpuCommandEncoder | undefined;
  lastApplied: { pipeline: TgpuRenderPipeline; version: number } | undefined;
}

/**
 * The draw-recording surface shared by render passes and render bundle encoders,
 * mirroring {@link GPURenderCommandsMixin}.
 *
 * Draw either by binding TypeGPU pipelines to it (`pipeline.with(pass).draw(...)`),
 * or proxy-style via `pass.setPipeline(pipeline)` followed by `pass.draw(...)`.
 * Pipeline resolution is lazy - shaders compile on the first draw.
 */
export interface TgpuRenderCommands {
  readonly [$internal]: RenderPassInternals;
  readonly resourceType: 'render-pass' | 'render-bundle-pass';

  /** Sets the current {@link TgpuRenderPipeline} for subsequent draw calls */
  setPipeline(pipeline: TgpuRenderPipeline): void;

  /** Associates a bind group with the layout it was created from */
  setBindGroup(bindGroup: TgpuBindGroup): void;
  /** Associates a bind group with the given layout */
  setBindGroup<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries> | GPUBindGroup,
  ): void;

  /** Binds a vertex buffer to the given vertex layout */
  setVertexBuffer<TData extends WgslArray | Disarray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: (TgpuBuffer<TData> & VertexFlag) | GPUBuffer,
    offset?: number,
    size?: number,
  ): void;

  /** Sets the current index buffer */
  setIndexBuffer<TData extends WgslArray | Disarray>(
    buffer: TgpuBuffer<TData> | GPUBuffer,
    indexFormat: GPUIndexFormat,
    offset?: number,
    size?: number,
  ): void;

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void;
  drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): void;
  drawIndexedIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): void;
}

/**
 * A render pass recording into a {@link TgpuCommandEncoder}. On top of the
 * draw commands, it exposes the state that WebGPU scopes to a render pass.
 *
 * Call `end()` when done recording.
 */
export interface TgpuRenderPass extends TgpuRenderCommands {
  readonly [$internal]: RenderPassInternals<GPURenderPassEncoder>;
  readonly resourceType: 'render-pass';

  setViewport(
    x: number,
    y: number,
    width: number,
    height: number,
    minDepth: number,
    maxDepth: number,
  ): void;
  setScissorRect(x: number, y: number, width: number, height: number): void;
  setBlendConstant(color: GPUColor): void;
  setStencilReference(reference: GPUStencilValue): void;
  beginOcclusionQuery(queryIndex: GPUSize32): void;
  endOcclusionQuery(): void;

  /**
   * Executes previously recorded {@link GPURenderBundle}s as part of this pass.
   * As per the WebGPU spec, this resets the raw pass's pipeline, bind group
   * and vertex/index buffer state. The state tracked by this typed pass is
   * re-applied on the next draw.
   */
  executeBundles(bundles: Iterable<GPURenderBundle>): void;

  /** Completes the recording of this render pass */
  end(): void;
}

// --------------
// Implementation
// --------------

function attachmentAspects(
  view: DepthStencilAttachment['view'],
): { hasDepth: boolean; hasStencil: boolean } | undefined {
  let format: GPUTextureFormat | undefined;
  let aspect: GPUTextureAspect = 'all';

  if (isTexture(view)) {
    format = view.props.format;
  } else if (isTextureView(view)) {
    format = view[$internal].format;
    aspect = view[$internal].aspect ?? 'all';
  }

  if (format === undefined) {
    return undefined;
  }

  return {
    hasDepth: format.includes('depth') && aspect !== 'stencil-only',
    hasStencil: format.includes('stencil') && aspect !== 'depth-only',
  };
}

function withDepthStencilDefaults(
  attachment: DepthStencilAttachment,
  view: GPUTextureView,
): GPURenderPassDepthStencilAttachment {
  const rawAttachment = { ...attachment, view } as GPURenderPassDepthStencilAttachment;
  const aspects = attachmentAspects(attachment.view);

  if (aspects === undefined) {
    const hasExplicitOps =
      attachment.depthLoadOp !== undefined ||
      attachment.depthStoreOp !== undefined ||
      attachment.stencilLoadOp !== undefined ||
      attachment.stencilStoreOp !== undefined;
    if (hasExplicitOps) {
      return rawAttachment;
    }
  }

  const { hasDepth, hasStencil } = aspects ?? { hasDepth: true, hasStencil: false };

  if (hasDepth && !attachment.depthReadOnly) {
    rawAttachment.depthLoadOp ??= 'clear';
    rawAttachment.depthStoreOp ??= 'store';
    rawAttachment.depthClearValue ??= 1;
  }

  if (hasStencil && !attachment.stencilReadOnly) {
    rawAttachment.stencilLoadOp ??= 'clear';
    rawAttachment.stencilStoreOp ??= 'store';
  }

  return rawAttachment;
}

export function INTERNAL_beginRenderPass(
  encoder: TgpuCommandEncoder,
  descriptor: TgpuRenderPassDescriptor,
): TgpuRenderPass {
  const { rawEncoder, root } = encoder[$internal];
  const colorAttachments =
    descriptor.colorAttachments === undefined
      ? []
      : Array.isArray(descriptor.colorAttachments)
        ? (descriptor.colorAttachments as readonly (ColorAttachment | null)[])
        : [descriptor.colorAttachments as ColorAttachment];

  const rawDescriptor: GPURenderPassDescriptor = {
    colorAttachments: colorAttachments.map((attachment) => {
      if (attachment === null) {
        return null;
      }

      const rawAttachment = {
        ...attachment,
        loadOp: attachment.loadOp ?? 'clear',
        storeOp: attachment.storeOp ?? 'store',
        view: unwrapAttachmentView(root, attachment.view),
      } as GPURenderPassColorAttachment;

      if (attachment.resolveTarget !== undefined) {
        rawAttachment.resolveTarget = unwrapAttachmentView(root, attachment.resolveTarget);
      }

      return rawAttachment;
    }),
  };

  if (descriptor.label !== undefined) {
    rawDescriptor.label = descriptor.label;
  }

  if (descriptor.depthStencilAttachment !== undefined) {
    rawDescriptor.depthStencilAttachment = withDepthStencilDefaults(
      descriptor.depthStencilAttachment,
      unwrapAttachmentView(root, descriptor.depthStencilAttachment.view),
    );
  }

  if (descriptor.occlusionQuerySet !== undefined) {
    rawDescriptor.occlusionQuerySet = isQuerySet(descriptor.occlusionQuerySet)
      ? root.unwrap(descriptor.occlusionQuerySet)
      : descriptor.occlusionQuerySet;
  }

  if (descriptor.timestampWrites !== undefined) {
    rawDescriptor.timestampWrites = unwrapTimestampWrites(
      root,
      descriptor.timestampWrites,
    ) as GPURenderPassTimestampWrites;
  }

  if (descriptor.maxDrawCount !== undefined) {
    rawDescriptor.maxDrawCount = descriptor.maxDrawCount;
  }

  return new TgpuRenderPassImpl(root, rawEncoder.beginRenderPass(rawDescriptor), encoder);
}

export function INTERNAL_beginRenderBundlePass(
  root: ExperimentalTgpuRoot,
  bundleEncoder: GPURenderBundleEncoder,
): TgpuRenderCommands {
  return new TgpuRenderCommandsImpl(root, bundleEncoder, undefined);
}

/**
 * Wraps a raw pass encoder the user owns, so that draws recorded into it take
 * the same route as draws into a TypeGPU pass. The state is marked as
 * raw-accessed, since the encoder can be mutated behind our back at any point.
 */
export function INTERNAL_adoptRenderCommands(
  root: ExperimentalTgpuRoot,
  rawPass: GPURenderPassEncoder | GPURenderBundleEncoder,
): TgpuRenderCommands {
  const adopted =
    'executeBundles' in rawPass
      ? new TgpuRenderPassImpl(root, rawPass, undefined)
      : new TgpuRenderCommandsImpl(root, rawPass, undefined);
  adopted[$internal].state.rawAccessed = true;
  return adopted;
}

class TgpuRenderCommandsImpl<
  TRaw extends GPURenderPassEncoder | GPURenderBundleEncoder =
    | GPURenderPassEncoder
    | GPURenderBundleEncoder,
> implements TgpuRenderCommands {
  readonly [$internal]: RenderPassInternals<TRaw>;
  readonly resourceType: 'render-pass' | 'render-bundle-pass' = 'render-bundle-pass';
  readonly #root: ExperimentalTgpuRoot;

  constructor(root: ExperimentalTgpuRoot, rawPass: TRaw, owner: TgpuCommandEncoder | undefined) {
    this.#root = root;
    this[$internal] = {
      rawPass,
      state: new RenderDrawState(),
      owner,
      lastApplied: undefined,
    };
  }

  #emit(
    usesIndexBuffer: boolean,
    emit: (rawPass: GPURenderPassEncoder | GPURenderBundleEncoder) => void,
  ): void {
    const internals = this[$internal];
    const pipeline = internals.state.currentPipeline;

    if (!pipeline) {
      throw new Error('Cannot draw without a call to pass.setPipeline');
    }

    emitRenderDraw(this.#root, internals, pipeline, usesIndexBuffer, emit);
  }

  setPipeline(pipeline: TgpuRenderPipeline): void {
    const { state } = this[$internal];
    state.currentPipeline = pipeline;
    state.version++;
  }

  setBindGroup<Entries extends Record<string, TgpuLayoutEntry | null>>(
    first: TgpuBindGroup | TgpuBindGroupLayout<Entries>,
    bindGroup?: TgpuBindGroup<Entries> | GPUBindGroup,
  ): void {
    const { state } = this[$internal];
    if (isBindGroup(first)) {
      state.bindGroups.set(first.layout, first);
    } else {
      state.bindGroups.set(first as TgpuBindGroupLayout, bindGroup as TgpuBindGroup | GPUBindGroup);
    }
    state.version++;
  }

  setVertexBuffer<TData extends WgslArray | Disarray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: (TgpuBuffer<TData> & VertexFlag) | GPUBuffer,
    offset?: number,
    size?: number,
  ): void {
    const { state } = this[$internal];
    state.vertexBuffers.set(vertexLayout, { buffer, offset, size });
    state.version++;
  }

  setIndexBuffer<TData extends WgslArray | Disarray>(
    buffer: TgpuBuffer<TData> | GPUBuffer,
    indexFormat: GPUIndexFormat,
    offset?: number,
    size?: number,
  ): void {
    const { state } = this[$internal];
    state.indexBuffer = { buffer, indexFormat, offsetBytes: offset, sizeBytes: size };
    state.version++;
  }

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    this.#emit(false, (rawPass) =>
      rawPass.draw(vertexCount, instanceCount, firstVertex, firstInstance),
    );
  }

  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void {
    this.#emit(true, (rawPass) =>
      rawPass.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance),
    );
  }

  drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): void {
    this.#emit(false, (rawPass) => rawPass.drawIndirect(indirectBuffer, indirectOffset));
  }

  drawIndexedIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): void {
    this.#emit(true, (rawPass) => rawPass.drawIndexedIndirect(indirectBuffer, indirectOffset));
  }
}

class TgpuRenderPassImpl
  extends TgpuRenderCommandsImpl<GPURenderPassEncoder>
  implements TgpuRenderPass
{
  override readonly resourceType = 'render-pass';

  setViewport(
    x: number,
    y: number,
    width: number,
    height: number,
    minDepth: number,
    maxDepth: number,
  ): void {
    this[$internal].rawPass.setViewport(x, y, width, height, minDepth, maxDepth);
  }

  setScissorRect(x: number, y: number, width: number, height: number): void {
    this[$internal].rawPass.setScissorRect(x, y, width, height);
  }

  setBlendConstant(color: GPUColor): void {
    this[$internal].rawPass.setBlendConstant(color);
  }

  setStencilReference(reference: GPUStencilValue): void {
    const { state } = this[$internal];
    state.stencilReference = reference;
    state.version++;
  }

  beginOcclusionQuery(queryIndex: GPUSize32): void {
    this[$internal].rawPass.beginOcclusionQuery(queryIndex);
  }

  endOcclusionQuery(): void {
    this[$internal].rawPass.endOcclusionQuery();
  }

  executeBundles(bundles: Iterable<GPURenderBundle>): void {
    const internals = this[$internal];
    internals.rawPass.executeBundles(bundles);
    internals.lastApplied = undefined;
  }

  end(): void {
    this[$internal].rawPass.end();
  }
}

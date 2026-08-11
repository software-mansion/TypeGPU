import type { AnyBuiltin, OmitBuiltins } from '../../builtin.ts';
import type { IndexFlag, IndirectFlag, TgpuBuffer, VertexFlag } from '../buffer/buffer.ts';
import type { TgpuQuerySet } from '../querySet/querySet.ts';
import { isBuiltin } from '../../data/attributes.ts';
import { type Disarray, getCustomLocation, type UndecorateRecord } from '../../data/dataTypes.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { formatToWGSLType } from '../../data/vertexFormatData.ts';
import {
  type AnyVecInstance,
  type BaseData,
  isWgslData,
  type U16,
  type U32,
  type v4f,
  Void,
  type WgslArray,
  type WgslStruct,
} from '../../data/wgslTypes.ts';
import { resolve } from '../../resolutionCtx.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, PERF, setName } from '../../shared/meta.ts';
import type { TgpuDeviceOwningSoul } from '../../shared/soul.ts';
import { $getNameForward, $internal, $resolve, $soul } from '../../shared/symbols.ts';
import type { AnyVertexAttribs, TgpuVertexAttrib } from '../../shared/vertexFormat.ts';
import {
  isBindGroup,
  isBindGroupLayout,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import type { LogResources } from '../../tgsl/consoleLog/types.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { isGPUBuffer } from '../../types.ts';
import { wgslEnableExtensions, wgslEnableExtensionToFeatureName } from '../../wgslExtensions.ts';
import {
  type AnyAutoCustoms,
  AutoFragmentFn,
  type AutoFragmentIn,
  type AutoFragmentOut,
  AutoVertexFn,
  type AutoVertexIn,
  type AutoVertexOut,
} from '../function/autoIO.ts';
import type { TgpuFragmentFn } from '../function/tgpuFragmentFn.ts';
import type { TgpuVertexFn } from '../function/tgpuVertexFn.ts';
import { namespace } from '../resolve/namespace.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuSlot } from '../slot/slotTypes.ts';
import { connectAttributesToShader } from '../vertexLayout/connectAttributesToShader.ts';
import { isVertexLayout, type TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import { connectAttachmentToShader } from './connectAttachmentToShader.ts';
import { connectTargetsToShader } from './connectTargetsToShader.ts';
import {
  INTERNAL_adoptCommandEncoder,
  INTERNAL_createCommandEncoder,
  type TgpuCommandEncoder,
} from '../commandEncoder/commandEncoder.ts';
import type { ColorAttachment, DepthStencilAttachment } from '../commandEncoder/attachments.ts';
import {
  INTERNAL_adoptRenderCommands,
  type TgpuRenderCommands,
  type TgpuRenderPassDescriptor,
} from '../commandEncoder/renderPass.ts';
import { emitRenderDraw, finalizeOwnEncoder, requireIndexBuffer } from './drawState.ts';
import {
  isGPUCommandEncoder,
  isGPURenderBundleEncoder,
  isGPURenderPassEncoder,
  isTgpuCommandEncoder,
  isTgpuRenderCommands,
} from './typeGuards.ts';
import {
  createWithPerformanceCallback,
  createWithTimestampWrites,
  type Timeable,
  type TimestampWritesPriors,
} from './timeable.ts';
import { nonTransferablePriorsOf } from './priors.ts';
import { type PrimitiveOffsetInfo } from '../../data/offsetUtils.ts';
import { warnIfOverflow } from './webgpuLimitations.ts';
import {
  DRAW_INDEXED_INDIRECT_SIZE,
  DRAW_INDIRECT_SIZE,
  resolveIndirectOffset,
} from './pipelineUtils.ts';
import {
  NullPerformanceTracker,
  PerformanceTrackerImpl,
  type PerformanceTracker,
} from './performanceTracker.ts';
import { logger } from '../../tgpuLogger.ts';

export interface RenderPipelineInternals {
  readonly core: RenderPipelineCore;
  readonly priors: TgpuRenderPipelinePriors & TimestampWritesPriors;
  readonly root: ExperimentalTgpuRoot;
  readonly materialize: () => GPURenderPipeline;
}

export interface TgpuRenderPipelineSoul extends TgpuDeviceOwningSoul<
  'render-pipeline',
  GPURenderPipeline
> {
  usedBindGroupLayouts?: TgpuBindGroupLayout[] | undefined;
  usedVertexLayouts?: TgpuVertexLayout[] | undefined;
  fragmentOut?: BaseData | undefined;
  bindGroups?: [TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup][] | undefined;
  vertexBuffers?: [TgpuVertexLayout, (TgpuBuffer<BaseData> & VertexFlag) | GPUBuffer][] | undefined;
  indexBuffer?:
    | {
        buffer: (TgpuBuffer<BaseData> & IndexFlag) | GPUBuffer;
        indexFormat: GPUIndexFormat;
        offsetBytes?: number | undefined;
        sizeBytes?: number | undefined;
      }
    | undefined;
  stencilReference?: GPUStencilValue | undefined;
  timestampWrites?: TimestampWritesPriors['timestampWrites'];
  performanceCallback?: TimestampWritesPriors['performanceCallback'];
  nonTransferablePriors?: string[] | undefined;
}

// ----------
// Public API
// ----------

export type TgpuPrimitiveState =
  | GPUPrimitiveState
  | (Omit<GPUPrimitiveState, 'stripIndexFormat'> & {
      stripIndexFormat?: U32 | U16;
    })
  | undefined;

export type TgpuColorTargetState =
  | (Omit<GPUColorTargetState, 'format'> & {
      /**
       * The {@link GPUTextureFormat} of this color target. The pipeline will only be compatible with
       * {@link GPURenderPassEncoder}s which use a {@link GPUTextureView} of this format in the
       * corresponding color attachment.
       *
       * @default navigator.gpu.getPreferredCanvasFormat()
       */
      format?: GPUTextureFormat | undefined;
    })
  | undefined;

export interface HasIndexBuffer {
  readonly hasIndexBuffer: true;

  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void;
}

export interface TgpuRenderPipeline<in Targets = never>
  extends TgpuNamable, SelfResolvable, Timeable {
  readonly [$internal]: RenderPipelineInternals;
  readonly [$soul]: TgpuRenderPipelineSoul;
  readonly resourceType: 'render-pipeline';
  readonly hasIndexBuffer: boolean;

  with<TData extends WgslArray | Disarray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: (TgpuBuffer<TData> & VertexFlag) | GPUBuffer,
  ): this;
  /**
   * @deprecated This overload is outdated.
   * Call `pipeline.with(bindGroup)` instead.
   */
  with<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries>,
  ): this;
  with(bindGroupLayout: TgpuBindGroupLayout, bindGroup: GPUBindGroup): this;
  with(bindGroup: TgpuBindGroup): this;
  /**
   * Directs subsequent draw calls into the given render pass or render bundle
   * encoder, letting multiple pipelines share one pass (and one submission).
   */
  with(pass: TgpuRenderCommands): this;
  /**
   * Directs subsequent draw calls into the given command encoder. Each draw
   * records its own render pass; the caller owns the submission.
   */
  with(encoder: TgpuCommandEncoder): this;
  with(encoder: GPUCommandEncoder): this;
  with(pass: GPURenderPassEncoder): this;
  with(bundleEncoder: GPURenderBundleEncoder): this;

  /**
   * Attaches texture views to the pipeline's targets (outputs).
   *
   * @example
   * // Draw 3 vertices onto the context's canvas
   * pipeline
   *   .withColorAttachment({ view: context })
   *   .draw(3)
   *
   * @param attachment The object should match the shape
   * returned by the fragment shader, with values matching the {@link ColorAttachment} type.
   */
  withColorAttachment(attachment: FragmentOutToColorAttachment<Targets>): this;

  withDepthStencilAttachment(attachment: DepthStencilAttachment): this;

  withStencilReference(reference: GPUStencilValue): this;

  withIndexBuffer(
    buffer: TgpuBuffer<BaseData> & IndexFlag,
    offsetElements?: number,
    sizeElements?: number,
  ): this & HasIndexBuffer;
  withIndexBuffer(
    buffer: GPUBuffer,
    indexFormat: GPUIndexFormat,
    offsetBytes?: number,
    sizeBytes?: number,
  ): this & HasIndexBuffer;

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;

  /**
   * Immediately resolves the pipeline, then awaits `device.createRenderPipelineAsync()`.
   * NOTE: it is not necessary to initialize pipelines manually.
   */
  initAsync(): Promise<void>;

  /**
   * Immediately resolves the pipeline and creates WebGPU resources.
   * NOTE: it is not necessary to initialize pipelines manually.
   */
  initSync(): void;

  /**
   * Draws primitives using parameters read from a buffer.
   * The buffer must contain 4 consecutive u32 values (vertexCount, instanceCount, firstVertex, firstInstance).
   * To get the correct offset within complex data structures, use `d.memoryLayoutOf(...)`.
   *
   * @param indirectBuffer - Buffer marked with 'indirect' usage containing draw parameters or raw GPUBuffer
   * @param indirectOffset - PrimitiveOffsetInfo pointing to the first draw parameter. If not provided, starts at offset 0. To obtain safe offsets, use `d.memoryLayoutOf(...)`.
   */
  drawIndirect(
    indirectBuffer: (TgpuBuffer<BaseData> & IndirectFlag) | GPUBuffer,
    indirectOffset?: PrimitiveOffsetInfo | number,
  ): void;

  /**
   * Draws indexed primitives using parameters read from a buffer.
   * The buffer must contain 5 consecutive 32-bit integer values (indexCount u32, instanceCount u32, firstIndex u32, baseVertex i32, firstInstance u32).
   * To get the correct offset within complex data structures, use `d.memoryLayoutOf(...)`.
   *
   * @param indirectBuffer - Buffer marked with 'indirect' usage containing draw parameters or raw GPUBuffer
   * @param indirectOffset - PrimitiveOffsetInfo pointing to the first draw parameter. If not provided, starts at offset 0. To obtain safe offsets, use `d.memoryLayoutOf(...)`.
   */
  drawIndexedIndirect(
    indirectBuffer: (TgpuBuffer<BaseData> & IndirectFlag) | GPUBuffer,
    indirectOffset?: PrimitiveOffsetInfo | number,
  ): void;
}

export declare namespace TgpuRenderPipeline {
  interface DescriptorBase {
    /**
     * Describes the primitive-related properties of the pipeline.
     */
    primitive?: TgpuPrimitiveState | undefined;
    /**
     * Describes the optional depth-stencil properties, including the testing, operations, and bias.
     */
    depthStencil?: GPUDepthStencilState | undefined;
    /**
     * Describes the multi-sampling properties of the pipeline.
     */
    multisample?: GPUMultisampleState | undefined;
  }

  interface Descriptor extends DescriptorBase {
    vertex:
      | TgpuVertexFn
      | ((input: AutoVertexIn<Record<string, never>>) => AutoVertexOut<AnyAutoCustoms>);
    fragment?:
      | TgpuFragmentFn
      | ((
          input: AutoFragmentIn<Record<string, never>>,
        ) => AutoFragmentOut<undefined | v4f | AnyAutoCustoms>)
      | undefined;

    attribs?: AnyVertexAttribs | undefined;
    targets?: AnyFragmentTargets | undefined;
  }
}

export type FragmentOutToTargets<T> = T extends
  // (shell-less) no return
  | undefined
  // (shelled) builtin return
  | AnyBuiltin
  // (shelled) no return
  | Void
  // (shelled) empty object
  | Record<string, never>
  ? Record<string, never> | undefined
  : T extends
        | { readonly [$internal]: unknown } // a schema
        | number
        | boolean
        | AnyVecInstance // an instance
    ? TgpuColorTargetState
    : T extends Record<string, unknown> // a record
      ?
          // Stripping all builtin properties
          { [Key in keyof OmitBuiltins<T>]?: TgpuColorTargetState } | undefined
      :
          // The widest type is here on purpose. It allows createRenderPipeline
          // to correctly choose the right overload.
          TgpuColorTargetState | Record<string, TgpuColorTargetState>;

export type FragmentOutToColorAttachment<T> = T extends {
  readonly [$internal]: unknown;
}
  ? ColorAttachment
  : T extends Record<string, unknown>
    ? {
        // Stripping all decorated properties
        [Key in keyof UndecorateRecord<T>]: ColorAttachment;
      }
    : Record<string, never>;

export type AnyFragmentTargets = TgpuColorTargetState | Record<string, TgpuColorTargetState>;

export type AnyFragmentColorAttachment = ColorAttachment | Record<string, ColorAttachment>;

export type RenderPipelineCoreOptions = {
  root: ExperimentalTgpuRoot;
  slotBindings: [TgpuSlot<unknown>, unknown][];
  descriptor: TgpuRenderPipeline.Descriptor;
};

export function INTERNAL_createRenderPipeline(options: RenderPipelineCoreOptions) {
  return new TgpuRenderPipelineImpl(new RenderPipelineCore(options), {});
}

// --------------
// Implementation
// --------------

type TgpuRenderPipelinePriors = {
  readonly vertexLayoutMap?:
    | Map<TgpuVertexLayout, (TgpuBuffer<BaseData> & VertexFlag) | GPUBuffer>
    | undefined;
  readonly bindGroupLayoutMap?: Map<TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup> | undefined;
  readonly colorAttachment?: AnyFragmentColorAttachment | undefined;
  readonly depthStencilAttachment?: DepthStencilAttachment | undefined;
  readonly stencilReference?: GPUStencilValue | undefined;
  readonly indexBuffer?:
    | {
        buffer: (TgpuBuffer<BaseData> & IndexFlag) | GPUBuffer;
        indexFormat: GPUIndexFormat;
        offsetBytes?: number | undefined;
        sizeBytes?: number | undefined;
      }
    | undefined;
  /** A pass the pipeline draws into, but does not own */
  readonly pass?: TgpuRenderCommands | undefined;
  /** An encoder the pipeline records its own passes into, but does not submit */
  readonly encoder?: TgpuCommandEncoder | undefined;
} & TimestampWritesPriors;

type Memo = {
  pipeline: GPURenderPipeline;
  usedBindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | undefined;
  logResources: LogResources | undefined;
  usedVertexLayouts: TgpuVertexLayout[];
  fragmentOut: BaseData | undefined;
};

class TgpuRenderPipelineImpl implements TgpuRenderPipeline {
  public readonly [$internal]: RenderPipelineInternals;
  public readonly [$soul]: TgpuRenderPipelineSoul;
  public readonly resourceType = 'render-pipeline';
  [$getNameForward]: RenderPipelineCore;

  constructor(core: RenderPipelineCore, priors: TgpuRenderPipelinePriors) {
    this[$soul] = {
      type: 'render-pipeline',
      device: core.options.root.device,
      raw: undefined,
      label: undefined,
    };
    this[$internal] = {
      core,
      priors,
      root: core.options.root,
      materialize: () => {
        const soul = this[$soul];
        if (!soul.raw) {
          const memo = core.unwrap();
          soul.raw = memo.pipeline;
          soul.usedBindGroupLayouts = memo.usedBindGroupLayouts;
          soul.usedVertexLayouts = memo.usedVertexLayouts;
          soul.fragmentOut =
            (core.options.descriptor.fragment as TgpuFragmentFn | undefined)?.shell?.returnType ??
            memo.fragmentOut;
          soul.bindGroups = priors.bindGroupLayoutMap ? [...priors.bindGroupLayoutMap] : [];
          soul.vertexBuffers = priors.vertexLayoutMap ? [...priors.vertexLayoutMap] : [];
          soul.indexBuffer = priors.indexBuffer;
          soul.stencilReference = priors.stencilReference;
          soul.timestampWrites = priors.timestampWrites;
          soul.performanceCallback = priors.performanceCallback;
          soul.nonTransferablePriors = nonTransferablePriorsOf(priors);
        }
        return soul.raw;
      },
    };
    this[$getNameForward] = core;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return ctx.resolve(this[$internal].core);
  }

  toString(): string {
    return `renderPipeline:${getName(this) ?? '<unnamed>'}`;
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }

  #withPriors(patch: Partial<TgpuRenderPipelinePriors>): this {
    const { core, priors } = this[$internal];

    return new TgpuRenderPipelineImpl(core, { ...priors, ...patch }) as this;
  }

  with<TData extends WgslArray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: TgpuBuffer<TData> & VertexFlag,
  ): this;
  with(bindGroupLayout: TgpuBindGroupLayout, bindGroup: TgpuBindGroup): this;
  with(bindGroupLayout: TgpuBindGroupLayout, bindGroup: GPUBindGroup): this;
  with(bindGroup: TgpuBindGroup): this;
  with<TData extends WgslArray | Disarray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: GPUBuffer,
  ): this;
  with(pass: TgpuRenderCommands): this;
  with(encoder: TgpuCommandEncoder): this;
  with(encoder: GPUCommandEncoder): this;
  with(pass: GPURenderPassEncoder): this;
  with(bundleEncoder: GPURenderBundleEncoder): this;
  with(
    first:
      | TgpuVertexLayout
      | TgpuBindGroupLayout
      | TgpuBindGroup
      | TgpuRenderCommands
      | TgpuCommandEncoder
      | GPUCommandEncoder
      | GPURenderPassEncoder
      | GPURenderBundleEncoder,
    resource?: (TgpuBuffer<BaseData> & VertexFlag) | TgpuBindGroup | GPUBindGroup | GPUBuffer,
  ): this {
    const internals = this[$internal];

    if (isTgpuRenderCommands(first)) {
      return this.#withPriors({ pass: first, encoder: undefined });
    }

    if (isTgpuCommandEncoder(first)) {
      return this.#withPriors({ pass: undefined, encoder: first });
    }

    if (isGPURenderPassEncoder(first) || isGPURenderBundleEncoder(first)) {
      return this.#withPriors({
        pass: INTERNAL_adoptRenderCommands(internals.root, first),
        encoder: undefined,
      });
    }

    if (isGPUCommandEncoder(first)) {
      return this.#withPriors({
        pass: undefined,
        encoder: INTERNAL_adoptCommandEncoder(internals.root, first),
      });
    }

    if (isBindGroup(first) || isBindGroupLayout(first)) {
      const [layout, group] = isBindGroup(first)
        ? [first.layout, first]
        : [first, resource as TgpuBindGroup | GPUBindGroup];

      return this.#withPriors({
        bindGroupLayoutMap: new Map([
          ...(internals.priors.bindGroupLayoutMap ?? []),
          [layout, group],
        ]),
      });
    }

    if (isVertexLayout(first)) {
      return this.#withPriors({
        vertexLayoutMap: new Map([
          ...(internals.priors.vertexLayoutMap ?? []),
          [first, resource as (TgpuBuffer<BaseData> & VertexFlag) | GPUBuffer],
        ]),
      });
    }

    throw new Error('Unsupported value passed into .with()');
  }

  withPerformanceCallback(callback: (start: bigint, end: bigint) => void | Promise<void>): this {
    const internals = this[$internal];

    if (internals.priors.timestampWrites) {
      return this.#withPriors({ performanceCallback: callback });
    }

    const querySet = internals.core.performanceCallbackQuerySet;
    if (!querySet) {
      logger.warn(
        'webgpu-feature-missing',
        'Performance callback cannot be used because the timestamp-query feature is not enabled on the root.',
      );
      return this;
    }
    return this.#withPriors(createWithPerformanceCallback(internals.priors, callback, querySet));
  }

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): this {
    const internals = this[$internal];

    return this.#withPriors(createWithTimestampWrites(internals.priors, options, internals.root));
  }

  withColorAttachment(attachment: AnyFragmentColorAttachment): this {
    return this.#withPriors({ colorAttachment: attachment });
  }

  withDepthStencilAttachment(attachment: DepthStencilAttachment): this {
    return this.#withPriors({ depthStencilAttachment: attachment });
  }

  withStencilReference(reference: GPUStencilValue): this {
    return this.#withPriors({ stencilReference: reference });
  }

  withIndexBuffer(
    buffer: TgpuBuffer<BaseData> & IndexFlag,
    offsetElements?: number,
    sizeElements?: number,
  ): this & HasIndexBuffer;
  withIndexBuffer(
    buffer: GPUBuffer,
    indexFormat: GPUIndexFormat,
    offsetBytes?: number,
    sizeBytes?: number,
  ): this & HasIndexBuffer;
  withIndexBuffer(
    buffer: (TgpuBuffer<BaseData> & IndexFlag) | GPUBuffer,
    indexFormatOrOffset?: GPUIndexFormat | number,
    offsetElementsOrSizeBytes?: number,
    sizeElementsOrUndefined?: number,
  ): this & HasIndexBuffer {
    if (isGPUBuffer(buffer)) {
      if (typeof indexFormatOrOffset !== 'string') {
        throw new Error('If a GPUBuffer is passed, indexFormat must be provided.');
      }

      return this.#withPriors({
        indexBuffer: {
          buffer,
          indexFormat: indexFormatOrOffset,
          offsetBytes: offsetElementsOrSizeBytes,
          sizeBytes: sizeElementsOrUndefined,
        },
      }) as unknown as this & HasIndexBuffer;
    }

    const dataTypeToIndexFormat = {
      u32: 'uint32',
      u16: 'uint16',
    } as const;

    const elementType = (buffer.dataType as WgslArray<U32 | U16>).elementType;

    return this.#withPriors({
      indexBuffer: {
        buffer,
        indexFormat: dataTypeToIndexFormat[elementType.type],
        offsetBytes:
          indexFormatOrOffset !== undefined
            ? (indexFormatOrOffset as number) * sizeOf(elementType)
            : undefined,
        sizeBytes:
          sizeElementsOrUndefined !== undefined
            ? sizeElementsOrUndefined * sizeOf(elementType)
            : undefined,
      },
    }) as unknown as this & HasIndexBuffer;
  }

  initAsync(): Promise<void> {
    return this[$internal].core.initAsync();
  }

  initSync() {
    this[$internal].core.initSync();
  }

  get hasIndexBuffer() {
    return this[$internal].priors.indexBuffer !== undefined;
  }

  #ownPassDescriptor(): TgpuRenderPassDescriptor {
    const { core, priors } = this[$internal];
    const { fragmentOut } = core.unwrap();

    return {
      label: getName(core) ?? '<unnamed>',
      colorAttachments: fragmentOut
        ? connectAttachmentToShader(fragmentOut, priors.colorAttachment ?? {})
        : [],
      depthStencilAttachment: priors.depthStencilAttachment,
      timestampWrites: priors.timestampWrites,
    };
  }

  #execute(
    usesIndexBuffer: boolean,
    emit: (rawPass: GPURenderPassEncoder | GPURenderBundleEncoder) => void,
  ): void {
    const { core, priors, root } = this[$internal];

    if (priors.pass) {
      emitRenderDraw(root, priors.pass[$internal], this, usesIndexBuffer, emit);
      return;
    }

    // checked up front so a rejected draw never leaves a half-recorded pass behind
    if (usesIndexBuffer) {
      requireIndexBuffer(priors.indexBuffer);
    }

    const encoder = priors.encoder ?? INTERNAL_createCommandEncoder(root);
    const pass = encoder.beginRenderPass(this.#ownPassDescriptor());
    emitRenderDraw(root, pass[$internal], this, usesIndexBuffer, emit, /* ownsPass */ true);
    pass.end();

    finalizeOwnEncoder(encoder, core, core.unwrap().logResources, priors);
  }

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    this.#execute(false, (rawPass) =>
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
    this.#execute(true, (rawPass) =>
      rawPass.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance),
    );
  }

  drawIndirect(
    indirectBuffer: (TgpuBuffer<BaseData> & IndirectFlag) | GPUBuffer,
    indirectOffset?: PrimitiveOffsetInfo | number,
  ): void {
    const rawBuffer = isGPUBuffer(indirectBuffer) ? indirectBuffer : indirectBuffer.buffer;
    const offset = resolveIndirectOffset(
      indirectBuffer,
      indirectOffset,
      DRAW_INDIRECT_SIZE,
      'drawIndirect',
    );

    this.#execute(false, (rawPass) => rawPass.drawIndirect(rawBuffer, offset));
  }

  drawIndexedIndirect(
    indirectBuffer: (TgpuBuffer<BaseData> & IndirectFlag) | GPUBuffer,
    indirectOffset?: PrimitiveOffsetInfo | number,
  ): void {
    const rawBuffer = isGPUBuffer(indirectBuffer) ? indirectBuffer : indirectBuffer.buffer;
    const offset = resolveIndirectOffset(
      indirectBuffer,
      indirectOffset,
      DRAW_INDEXED_INDIRECT_SIZE,
      'drawIndexedIndirect',
    );

    this.#execute(true, (rawPass) => rawPass.drawIndexedIndirect(rawBuffer, offset));
  }
}

class RenderPipelineCore implements SelfResolvable {
  readonly [$internal] = true;
  readonly options: RenderPipelineCoreOptions;
  #performanceTracker: PerformanceTracker;

  #initAsyncPromise: Promise<void> | undefined;
  #memo: Memo | undefined;

  #latestAutoVertexIn: TgpuVertexFn.In | undefined;
  #latestAutoFragmentOut: BaseData | undefined;
  #performanceCallbackQuerySet: TgpuQuerySet<'timestamp'> | undefined;

  constructor(options: RenderPipelineCoreOptions) {
    this.options = options;
    this.#performanceTracker = PERF?.enabled
      ? new PerformanceTrackerImpl()
      : new NullPerformanceTracker();
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const { slotBindings } = this.options;
    const { vertex, fragment, attribs = {} } = this.options.descriptor;
    this.#latestAutoVertexIn = undefined;
    this.#latestAutoFragmentOut = undefined;

    const locations = matchUpVaryingLocations(
      (vertex as TgpuVertexFn | undefined)?.shell?.out,
      (fragment as TgpuFragmentFn | undefined)?.shell?.in,
      getName(vertex) ?? '<unnamed>',
      getName(fragment) ?? '<unnamed>',
    );

    return ctx.withVaryingLocations(locations, () =>
      ctx.withSlots(slotBindings, () => {
        let vertexOut: WgslStruct;
        if (typeof vertex === 'function') {
          const defaultAttribData = Object.fromEntries(
            Object.entries(attribs as Record<string, TgpuVertexAttrib>).map(([key, value]) => [
              key,
              formatToWGSLType[value.format],
            ]),
          );
          const autoFn = new AutoVertexFn(vertex, defaultAttribData, locations);
          ctx.resolve(autoFn);
          this.#latestAutoVertexIn = autoFn.autoIn.completeStruct.propTypes;
          vertexOut = autoFn.autoOut.completeStruct;
        } else {
          vertexOut = ctx.resolve(vertex).dataType as WgslStruct;
        }

        if (fragment) {
          if (typeof fragment === 'function') {
            const varyings = Object.fromEntries(
              Object.entries(vertexOut.propTypes).filter(([, dataType]) => !isBuiltin(dataType)),
            );
            const fragOut = ctx.resolve(new AutoFragmentFn(fragment, varyings, locations));
            this.#latestAutoFragmentOut = fragOut.dataType;
          } else {
            ctx.resolve(fragment);
          }
        }
        return snip('', Void, /* origin */ 'runtime');
      }),
    );
  }

  toString() {
    return 'renderPipelineCore';
  }

  get performanceCallbackQuerySet() {
    if (!this.options.root.enabledFeatures.has('timestamp-query')) {
      return undefined;
    }
    return (this.#performanceCallbackQuerySet ??= this.options.root.createQuerySet('timestamp', 2));
  }

  initAsync(): Promise<void> {
    if (this.#memo !== undefined) {
      // the pipeline was already resolved & compiled
      return Promise.resolve();
    }

    if (this.#initAsyncPromise === undefined) {
      // the pipeline did not start resolution & compilation
      const device = this.options.root.device;
      const { resolutionResult, descriptor, connectedAttribs, fragmentOut } =
        this.resolveAndCreateShaderModule();
      const { usedBindGroupLayouts, catchall, logResources } = resolutionResult;

      this.#initAsyncPromise = device
        .createRenderPipelineAsync(descriptor)
        .then((pipeline) => {
          this.#memo = {
            pipeline,
            usedBindGroupLayouts,
            catchall,
            logResources,
            usedVertexLayouts: connectedAttribs.usedVertexLayouts,
            fragmentOut,
          };
          this.#performanceTracker.measureCompile(device);
        })
        .finally(() => {
          this.#initAsyncPromise = undefined;
        });
    }
    return this.#initAsyncPromise;
  }

  initSync() {
    if (this.#memo !== undefined) {
      return;
    }

    if (this.#initAsyncPromise !== undefined) {
      throw new Error("'pipeline.initAsync()' was called and is not yet resolved.");
    }

    const device = this.options.root.device;
    const { resolutionResult, descriptor, connectedAttribs, fragmentOut } =
      this.resolveAndCreateShaderModule();
    const { usedBindGroupLayouts, catchall, logResources } = resolutionResult;

    this.#memo = {
      pipeline: device.createRenderPipeline(descriptor),
      usedBindGroupLayouts,
      catchall,
      logResources,
      usedVertexLayouts: connectedAttribs.usedVertexLayouts,
      fragmentOut,
    };

    this.#performanceTracker.measureCompile(device);
  }

  public unwrap(): Memo {
    this.initSync();
    return this.#memo as Memo;
  }

  public resolveAndCreateShaderModule() {
    const { root, descriptor: tgpuDescriptor } = this.options;
    const device = root.device;
    const enableExtensions = wgslEnableExtensions.filter((extension) =>
      root.enabledFeatures.has(wgslEnableExtensionToFeatureName[extension]),
    );

    // Resolving code
    const ns = namespace({ names: root.nameRegistrySetting });
    const resolutionResult = this.#performanceTracker.measureResolve(() =>
      resolve(this, {
        namespace: ns,
        enableExtensions,
        shaderGenerator: root.shaderGeneratorClass ? new root.shaderGeneratorClass() : undefined,
        root,
      }),
    );

    const { code, usedBindGroupLayouts, catchall } = resolutionResult;

    if (catchall !== undefined) {
      usedBindGroupLayouts[catchall[0]]?.$name(
        `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
      );
    }

    warnIfOverflow(usedBindGroupLayouts, device.limits);

    const module = device.createShaderModule({
      label: `${getName(this) ?? '<unnamed>'} - Shader`,
      code,
    });

    const { vertex, fragment, attribs = {}, targets } = this.options.descriptor;
    const connectedAttribs = connectAttributesToShader(
      (vertex as TgpuVertexFn)?.shell?.in ?? this.#latestAutoVertexIn ?? {},
      attribs,
    );

    // If the fragment output is a single builtin, then this.#latestAutoFragmentOut doesn't
    // retain that information, that's why we use that here and fallback to this.#latestAutoFragmentOut.
    // One other reason is that if the shelled fragment has already been resolved in this namespace,
    // then this.#latestAutoFragmentOut will be undefined.
    const fragmentOut =
      (fragment as TgpuFragmentFn)?.shell?.returnType ?? this.#latestAutoFragmentOut;
    const connectedTargets = fragmentOut ? connectTargetsToShader(fragmentOut, targets) : [null];

    const descriptor: GPURenderPipelineDescriptor = {
      layout: device.createPipelineLayout({
        label: `${getName(this) ?? '<unnamed>'} - Pipeline Layout`,
        bindGroupLayouts: usedBindGroupLayouts.map((l) => root.unwrap(l)),
      }),
      vertex: {
        module,
        buffers: connectedAttribs.bufferDefinitions,
      },
    };

    const label = getName(this);
    if (label !== undefined) {
      descriptor.label = label;
    }

    if (tgpuDescriptor.fragment) {
      descriptor.fragment = {
        module,
        targets: connectedTargets,
      };
    }

    if (tgpuDescriptor.primitive) {
      if (isWgslData(tgpuDescriptor.primitive.stripIndexFormat)) {
        descriptor.primitive = {
          ...tgpuDescriptor.primitive,
          stripIndexFormat: {
            u32: 'uint32',
            u16: 'uint16',
          }[tgpuDescriptor.primitive.stripIndexFormat.type] as GPUIndexFormat,
        };
      } else {
        descriptor.primitive = tgpuDescriptor.primitive as GPUPrimitiveState;
      }
    }

    if (tgpuDescriptor.depthStencil) {
      descriptor.depthStencil = tgpuDescriptor.depthStencil;
    }

    if (tgpuDescriptor.multisample) {
      descriptor.multisample = tgpuDescriptor.multisample;
    }

    return { resolutionResult, descriptor, connectedAttribs, fragmentOut };
  }
}

/**
 * Assumes vertexOut and fragmentIn are matching when it comes to the keys, that is fragmentIn's keyset is a subset of vertexOut's
 * Logs a warning, when they don't match in terms of custom locations
 */
export function matchUpVaryingLocations(
  vertexOut: TgpuVertexFn.Out | undefined = {},
  fragmentIn: TgpuFragmentFn.In | undefined = {},
  vertexFnName: string,
  fragmentFnName: string,
) {
  const locations: Record<string, number> = {};
  const usedLocations = new Set<number>();

  function saveLocation(key: string, location: number) {
    locations[key] = location;
    usedLocations.add(location);
  }

  // respect custom locations and pair up vertex and fragment varying with the same key
  for (const [key, value] of Object.entries(vertexOut)) {
    const customLocation = getCustomLocation(value);
    if (customLocation !== undefined) {
      saveLocation(key, customLocation);
    }
  }

  for (const [key, value] of Object.entries(fragmentIn)) {
    const customLocation = getCustomLocation(value);
    if (customLocation === undefined) {
      continue;
    }

    if (locations[key] === undefined) {
      saveLocation(key, customLocation);
    } else if (locations[key] !== customLocation) {
      logger.warn(
        'locations-mismatched',
        `Mismatched location between vertexFn (${vertexFnName}) output (${
          locations[key]
        }) and fragmentFn (${fragmentFnName}) input (${customLocation}) for the key "${key}", using the location set on vertex output.`,
      );
    }
  }

  // automatically assign remaining locations to the rest
  let nextLocation = 0;
  for (const key of Object.keys(vertexOut ?? {})) {
    if (isBuiltin(vertexOut[key]) || locations[key] !== undefined) {
      continue;
    }

    while (usedLocations.has(nextLocation)) {
      nextLocation++;
    }

    saveLocation(key, nextLocation);
  }

  return locations;
}

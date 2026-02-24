import type { AnyBuiltin, OmitBuiltins } from '../../builtin.ts';
import type {
  IndexFlag,
  TgpuBuffer,
  VertexFlag,
} from '../../core/buffer/buffer.ts';
import type { TgpuQuerySet } from '../../core/querySet/querySet.ts';
import { isBuiltin } from '../../data/attributes.ts';
import {
  type Disarray,
  getCustomLocation,
  type UndecorateRecord,
} from '../../data/dataTypes.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import {
  type ResolvedSnippet,
  snip,
  type Snippet,
} from '../../data/snippet.ts';
import type {
  WgslTexture,
  WgslTextureDepth2d,
  WgslTextureDepthMultisampled2d,
} from '../../data/texture.ts';
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
import { type ResolutionResult, resolve } from '../../resolutionCtx.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, PERF, setName } from '../../shared/meta.ts';
import { $getNameForward, $internal, $resolve } from '../../shared/symbols.ts';
import type {
  AnyVertexAttribs,
  TgpuVertexAttrib,
} from '../../shared/vertexFormat.ts';
import {
  isBindGroup,
  isBindGroupLayout,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import { logDataFromGPU } from '../../tgsl/consoleLog/deserializers.ts';
import type { LogResources } from '../../tgsl/consoleLog/types.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { isGPUBuffer } from '../../types.ts';
import {
  wgslExtensions,
  wgslExtensionToFeatureName,
} from '../../wgslExtensions.ts';
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
import {
  isTexture,
  isTextureView,
  type TextureInternals,
  // oxlint-disable-next-line no-unused-vars used in docs
  type TgpuTexture,
  type TgpuTextureRenderView,
  type TgpuTextureView,
} from '../texture/texture.ts';
import type { RenderFlag } from '../texture/usageExtension.ts';
import { connectAttributesToShader } from '../vertexLayout/connectAttributesToShader.ts';
import {
  isVertexLayout,
  type TgpuVertexLayout,
} from '../vertexLayout/vertexLayout.ts';
import { connectAttachmentToShader } from './connectAttachmentToShader.ts';
import { connectTargetsToShader } from './connectTargetsToShader.ts';
import { applyBindGroups, applyVertexBuffers } from './applyPipelineState.ts';
import {
  isGPUCommandEncoder,
  isGPURenderBundleEncoder,
  isGPURenderPassEncoder,
} from './typeGuards.ts';
import {
  createWithPerformanceCallback,
  createWithTimestampWrites,
  setupTimestampWrites,
  type Timeable,
  type TimestampWritesPriors,
  triggerPerformanceCallback,
} from './timeable.ts';

interface RenderPipelineInternals {
  readonly core: RenderPipelineCore;
  readonly priors: TgpuRenderPipelinePriors & TimestampWritesPriors;
  readonly root: ExperimentalTgpuRoot;
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
  | Omit<GPUColorTargetState, 'format'> & {
    /**
     * The {@link GPUTextureFormat} of this color target. The pipeline will only be compatible with
     * {@link GPURenderPassEncoder}s which use a {@link GPUTextureView} of this format in the
     * corresponding color attachment.
     *
     * @default navigator.gpu.getPreferredCanvasFormat()
     */
    format?: GPUTextureFormat | undefined;
  }
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
    bindGroup: TgpuBindGroup<Entries> | GPUBindGroup,
  ): this;
  with(bindGroup: TgpuBindGroup): this;
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

  drawIndirect(
    indirectBuffer: TgpuBuffer<BaseData> | GPUBuffer,
    indirectOffset?: GPUSize64,
  ): void;

  drawIndexedIndirect(
    indirectBuffer: TgpuBuffer<BaseData> | GPUBuffer,
    indirectOffset?: GPUSize64,
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
      | ((
        input: AutoVertexIn<Record<string, never>>,
      ) => AutoVertexOut<AnyAutoCustoms>);
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

// deno-fmt-ignore: More readable branching logic
export type FragmentOutToTargets<T> =
  T extends
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
      | number | boolean | AnyVecInstance // an instance
    ? TgpuColorTargetState
  : T extends Record<string, unknown> // a record
  // Stripping all builtin properties
  ? { [Key in keyof OmitBuiltins<T>]?: TgpuColorTargetState; } | undefined
  // The widest type is here on purpose. It allows createRenderPipeline
  // to correctly choose the right overload.
  : TgpuColorTargetState | Record<string, TgpuColorTargetState>;

export type FragmentOutToColorAttachment<T> = T extends {
  readonly [$internal]: unknown;
} ? ColorAttachment
  : T extends Record<string, unknown> ? {
      // Stripping all decorated properties
      [Key in keyof UndecorateRecord<T>]: ColorAttachment;
    }
  : Record<string, never>;

export type AnyFragmentTargets =
  | TgpuColorTargetState
  | Record<string, TgpuColorTargetState>;

interface ColorTextureConstraint {
  readonly [$internal]: TextureInternals;
  readonly resourceType: 'texture';
  readonly props: { format: GPUTextureFormat };
}

export interface ColorAttachment {
  /**
   * A {@link GPUTextureView} describing the texture subresource that will be output to for this
   * color attachment.
   */
  view:
    | (ColorTextureConstraint & RenderFlag)
    | GPUTextureView
    | TgpuTextureView<WgslTexture>
    | TgpuTextureRenderView
    // We call `.getCurrentTexture().createView()` underneath
    | GPUCanvasContext;
  /**
   * Indicates the depth slice index of {@link GPUTextureViewDimension#"3d"} {@link GPURenderPassColorAttachment#view}
   * that will be output to for this color attachment.
   */
  depthSlice?: GPUIntegerCoordinate;
  /**
   * A {@link GPUTextureView} describing the texture subresource that will receive the resolved
   * output for this color attachment if {@link GPURenderPassColorAttachment#view} is
   * multisampled.
   */
  resolveTarget?:
    | (ColorTextureConstraint & RenderFlag)
    | GPUTextureView
    | TgpuTextureView<WgslTexture>
    | TgpuTextureRenderView
    // We call `.getCurrentTexture().createView()` underneath
    | GPUCanvasContext;
  /**
   * Indicates the value to clear {@link GPURenderPassColorAttachment#view} to prior to executing the
   * render pass. If not map/exist|provided, defaults to `{r: 0, g: 0, b: 0, a: 0}`. Ignored
   * if {@link GPURenderPassColorAttachment#loadOp} is not {@link GPULoadOp#"clear"}.
   * The components of {@link GPURenderPassColorAttachment#clearValue} are all double values.
   * They are converted to a texel value of texture format matching the render attachment.
   * If conversion fails, a validation error is generated.
   */
  clearValue?: GPUColor;
  /**
   * Indicates the load operation to perform on {@link GPURenderPassColorAttachment#view} prior to
   * executing the render pass.
   * Note: It is recommended to prefer clearing; see {@link GPULoadOp#"clear"} for details.
   *
   * @default 'clear'
   */
  loadOp?: GPULoadOp | undefined;
  /**
   * The store operation to perform on {@link GPURenderPassColorAttachment#view}
   * after executing the render pass.
   *
   * @default 'store'
   */
  storeOp?: GPUStoreOp | undefined;
}

export type DepthStencilFormat =
  | 'stencil8'
  | 'depth16unorm'
  | 'depth24plus'
  | 'depth24plus-stencil8'
  | 'depth32float'
  | 'depth32float-stencil8';

interface DepthStencilTextureConstraint {
  readonly [$internal]: TextureInternals;
  readonly resourceType: 'texture';
  readonly props: { format: DepthStencilFormat };
}

export interface DepthStencilAttachment {
  /**
   * A {@link GPUTextureView} | ({@link TgpuTexture} & {@link RenderFlag}) describing the texture subresource that will be output to
   * and read from for this depth/stencil attachment.
   */
  view:
    | (DepthStencilTextureConstraint & RenderFlag)
    | TgpuTextureView<WgslTextureDepth2d | WgslTextureDepthMultisampled2d>
    | TgpuTextureRenderView
    | GPUTextureView;
  /**
   * Indicates the value to clear {@link GPURenderPassDepthStencilAttachment#view}'s depth component
   * to prior to executing the render pass. Ignored if {@link GPURenderPassDepthStencilAttachment#depthLoadOp}
   * is not {@link GPULoadOp#"clear"}. Must be between 0.0 and 1.0, inclusive (unless unrestricted depth is enabled).
   */
  depthClearValue?: number;
  /**
   * Indicates the load operation to perform on {@link GPURenderPassDepthStencilAttachment#view}'s
   * depth component prior to executing the render pass.
   * Note: It is recommended to prefer clearing; see {@link GPULoadOp#"clear"} for details.
   */
  depthLoadOp?: GPULoadOp;
  /**
   * The store operation to perform on {@link GPURenderPassDepthStencilAttachment#view}'s
   * depth component after executing the render pass.
   */
  depthStoreOp?: GPUStoreOp;
  /**
   * Indicates that the depth component of {@link GPURenderPassDepthStencilAttachment#view}
   * is read only.
   */
  depthReadOnly?: boolean;
  /**
   * Indicates the value to clear {@link GPURenderPassDepthStencilAttachment#view}'s stencil component
   * to prior to executing the render pass. Ignored if {@link GPURenderPassDepthStencilAttachment#stencilLoadOp}
   * is not {@link GPULoadOp#"clear"}.
   * The value will be converted to the type of the stencil aspect of `view` by taking the same
   * number of LSBs as the number of bits in the stencil aspect of one texel block|texel of `view`.
   */
  stencilClearValue?: GPUStencilValue;
  /**
   * Indicates the load operation to perform on {@link GPURenderPassDepthStencilAttachment#view}'s
   * stencil component prior to executing the render pass.
   * Note: It is recommended to prefer clearing; see {@link GPULoadOp#"clear"} for details.
   */
  stencilLoadOp?: GPULoadOp;
  /**
   * The store operation to perform on {@link GPURenderPassDepthStencilAttachment#view}'s
   * stencil component after executing the render pass.
   */
  stencilStoreOp?: GPUStoreOp;
  /**
   * Indicates that the stencil component of {@link GPURenderPassDepthStencilAttachment#view}
   * is read only.
   */
  stencilReadOnly?: boolean;
}

export type AnyFragmentColorAttachment =
  | ColorAttachment
  | Record<string, ColorAttachment>;

export type RenderPipelineCoreOptions = {
  root: ExperimentalTgpuRoot;
  slotBindings: [TgpuSlot<unknown>, unknown][];
  descriptor: TgpuRenderPipeline.Descriptor;
};

export function INTERNAL_createRenderPipeline(
  options: RenderPipelineCoreOptions,
) {
  return new TgpuRenderPipelineImpl(new RenderPipelineCore(options), {});
}

// --------------
// Implementation
// --------------

type TgpuRenderPipelinePriors = {
  readonly vertexLayoutMap?:
    | Map<TgpuVertexLayout, (TgpuBuffer<BaseData> & VertexFlag) | GPUBuffer>
    | undefined;
  readonly bindGroupLayoutMap?:
    | Map<TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup>
    | undefined;
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
  readonly externalEncoder?: GPUCommandEncoder | undefined;
  readonly externalRenderEncoder?:
    | GPURenderPassEncoder
    | GPURenderBundleEncoder
    | undefined;
} & TimestampWritesPriors;

type Memo = {
  pipeline: GPURenderPipeline;
  usedBindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | undefined;
  logResources: LogResources | undefined;
  usedVertexLayouts: TgpuVertexLayout[];
  fragmentOut: BaseData;
};

const _lastAppliedRender = new WeakMap<
  GPURenderPassEncoder | GPURenderBundleEncoder,
  TgpuRenderPipelineImpl
>();
class TgpuRenderPipelineImpl implements TgpuRenderPipeline {
  public readonly [$internal]: RenderPipelineInternals;
  public readonly resourceType = 'render-pipeline';
  [$getNameForward]: RenderPipelineCore;
  public readonly hasIndexBuffer: boolean = false;

  constructor(core: RenderPipelineCore, priors: TgpuRenderPipelinePriors) {
    this[$internal] = {
      core,
      priors,
      root: core.options.root,
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

  with<TData extends WgslArray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: TgpuBuffer<TData> & VertexFlag,
  ): this;
  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup | GPUBindGroup,
  ): this;
  with(bindGroup: TgpuBindGroup): this;
  with<TData extends WgslArray | Disarray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: GPUBuffer,
  ): this;
  with(encoder: GPUCommandEncoder): this;
  with(pass: GPURenderPassEncoder): this;
  with(bundleEncoder: GPURenderBundleEncoder): this;
  with(
    first:
      | TgpuVertexLayout
      | TgpuBindGroupLayout
      | TgpuBindGroup
      | GPUCommandEncoder
      | GPURenderPassEncoder
      | GPURenderBundleEncoder,
    resource?:
      | (TgpuBuffer<BaseData> & VertexFlag)
      | TgpuBindGroup
      | GPUBindGroup
      | GPUBuffer,
  ): this {
    const internals = this[$internal];

    if (isGPURenderPassEncoder(first) || isGPURenderBundleEncoder(first)) {
      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
        externalRenderEncoder: first,
        externalEncoder: undefined,
      }) as this;
    }

    if (isGPUCommandEncoder(first)) {
      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
        externalEncoder: first,
        externalRenderEncoder: undefined,
      }) as this;
    }

    if (isBindGroup(first)) {
      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
        bindGroupLayoutMap: new Map([
          ...(internals.priors.bindGroupLayoutMap ?? []),
          [first.layout, first],
        ]),
      }) as this;
    }

    if (isBindGroupLayout(first)) {
      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
        bindGroupLayoutMap: new Map([
          ...(internals.priors.bindGroupLayoutMap ?? []),
          [first, resource as TgpuBindGroup | GPUBindGroup],
        ]),
      }) as this;
    }

    if (isVertexLayout(first)) {
      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
        vertexLayoutMap: new Map([
          ...(internals.priors.vertexLayoutMap ?? []),
          [first, resource as (TgpuBuffer<BaseData> & VertexFlag) | GPUBuffer],
        ]),
      }) as this;
    }

    throw new Error('Unsupported value passed into .with()');
  }

  withPerformanceCallback(
    callback: (start: bigint, end: bigint) => void | Promise<void>,
  ): this {
    const internals = this[$internal];
    const newPriors = createWithPerformanceCallback(
      internals.priors,
      callback,
      internals.core.options.root,
    );
    return new TgpuRenderPipelineImpl(internals.core, newPriors) as this;
  }

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): this {
    const internals = this[$internal];
    const newPriors = createWithTimestampWrites(
      internals.priors,
      options,
      internals.core.options.root,
    );
    return new TgpuRenderPipelineImpl(internals.core, newPriors) as this;
  }

  withColorAttachment(attachment: AnyFragmentColorAttachment): this {
    const internals = this[$internal];

    return new TgpuRenderPipelineImpl(internals.core, {
      ...internals.priors,
      colorAttachment: attachment,
    }) as this;
  }

  withDepthStencilAttachment(attachment: DepthStencilAttachment): this {
    const internals = this[$internal];

    return new TgpuRenderPipelineImpl(internals.core, {
      ...internals.priors,
      depthStencilAttachment: attachment,
    }) as this;
  }

  withStencilReference(reference: GPUStencilValue): this {
    const internals = this[$internal];

    return new TgpuRenderPipelineImpl(internals.core, {
      ...internals.priors,
      stencilReference: reference,
    }) as this;
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
    const internals = this[$internal];

    if (isGPUBuffer(buffer)) {
      if (typeof indexFormatOrOffset !== 'string') {
        throw new Error(
          'If a GPUBuffer is passed, indexFormat must be provided.',
        );
      }

      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
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

    return new TgpuRenderPipelineImpl(internals.core, {
      ...internals.priors,
      indexBuffer: {
        buffer,
        indexFormat: dataTypeToIndexFormat[elementType.type],
        offsetBytes: indexFormatOrOffset !== undefined
          ? (indexFormatOrOffset as number) * sizeOf(elementType)
          : undefined,
        sizeBytes: sizeElementsOrUndefined !== undefined
          ? sizeElementsOrUndefined * sizeOf(elementType)
          : undefined,
      },
    }) as unknown as this & HasIndexBuffer;
  }

  private _createRenderPass(encoder: GPUCommandEncoder): GPURenderPassEncoder {
    const internals = this[$internal];
    const { root, descriptor } = internals.core.options;

    const memo = internals.core.unwrap();
    const colorAttachments = descriptor.fragment
      ? (connectAttachmentToShader(
        (descriptor.fragment as TgpuFragmentFn)?.shell?.returnType ??
          memo.fragmentOut,
        internals.priors.colorAttachment ?? {},
      ).map((_attachment) => {
        const attachment = {
          loadOp: 'clear',
          storeOp: 'store',
          ..._attachment,
        };

        if (isTexture(attachment.view)) {
          attachment.view = root.unwrap(attachment.view).createView();
        } else if (isTextureView(attachment.view)) {
          attachment.view = root.unwrap(attachment.view);
        } else if (isGPUCanvasContext(attachment.view)) {
          attachment.view = attachment.view.getCurrentTexture().createView();
        }

        if (isTexture(attachment.resolveTarget)) {
          attachment.resolveTarget = root.unwrap(attachment.resolveTarget)
            .createView();
        } else if (isTextureView(attachment.resolveTarget)) {
          attachment.resolveTarget = root.unwrap(attachment.resolveTarget);
        } else if (isGPUCanvasContext(attachment.resolveTarget)) {
          attachment.resolveTarget = attachment.resolveTarget
            .getCurrentTexture().createView();
        }

        return attachment;
      }) as GPURenderPassColorAttachment[])
      : [];

    const renderPassDescriptor: GPURenderPassDescriptor = {
      label: getName(internals.core) ?? '<unnamed>',
      colorAttachments,
      ...setupTimestampWrites(internals.priors, root),
    };

    const depthStencil = internals.priors.depthStencilAttachment;
    if (depthStencil !== undefined) {
      const view = isTexture(depthStencil.view)
        ? root.unwrap(depthStencil.view).createView()
        : isTextureView(depthStencil.view)
        ? root.unwrap(depthStencil.view)
        : depthStencil.view;

      renderPassDescriptor.depthStencilAttachment = {
        ...depthStencil,
        view,
      } as GPURenderPassDepthStencilAttachment;
    }

    return encoder.beginRenderPass(renderPassDescriptor);
  }

  private _applyRenderState(
    encoder: GPURenderPassEncoder | GPURenderBundleEncoder,
  ): void {
    const internals = this[$internal];
    const memo = internals.core.unwrap();
    const { root } = internals.core.options;
    encoder.setPipeline(memo.pipeline);

    applyBindGroups(
      encoder,
      root,
      memo.usedBindGroupLayouts,
      memo.catchall,
      (layout) => internals.priors.bindGroupLayoutMap?.get(layout),
    );

    applyVertexBuffers(
      encoder,
      root,
      memo.usedVertexLayouts,
      (layout) => {
        const buffer = internals.priors.vertexLayoutMap?.get(layout);
        return buffer ? { buffer } : undefined;
      },
    );

    if (
      internals.priors.stencilReference !== undefined &&
      'setStencilReference' in encoder
    ) {
      (encoder as GPURenderPassEncoder).setStencilReference(
        internals.priors.stencilReference,
      );
    }
  }

  private _setIndexBuffer(
    encoder: GPURenderPassEncoder | GPURenderBundleEncoder,
  ): void {
    const internals = this[$internal];
    const { root } = internals.core.options;

    if (!internals.priors.indexBuffer) {
      throw new Error('No index buffer set for this render pipeline.');
    }

    const { buffer, indexFormat, offsetBytes, sizeBytes } =
      internals.priors.indexBuffer;

    if (isGPUBuffer(buffer)) {
      encoder.setIndexBuffer(buffer, indexFormat, offsetBytes, sizeBytes);
    } else {
      encoder.setIndexBuffer(
        root.unwrap(buffer),
        indexFormat,
        offsetBytes,
        sizeBytes,
      );
    }
  }

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    const internals = this[$internal];
    const { root } = internals.core.options;

    if (internals.priors.externalRenderEncoder) {
      if (
        _lastAppliedRender.get(internals.priors.externalRenderEncoder) !== this
      ) {
        this._applyRenderState(internals.priors.externalRenderEncoder);
        _lastAppliedRender.set(internals.priors.externalRenderEncoder, this);
      }
      internals.priors.externalRenderEncoder.draw(
        vertexCount,
        instanceCount,
        firstVertex,
        firstInstance,
      );
      return;
    }

    if (internals.priors.externalEncoder) {
      const pass = this._createRenderPass(internals.priors.externalEncoder);
      this._applyRenderState(pass);
      pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);
      pass.end();
      return;
    }

    const { logResources } = internals.core.unwrap();

    const commandEncoder = root.device.createCommandEncoder();
    const pass = this._createRenderPass(commandEncoder);
    this._applyRenderState(pass);
    pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    pass.end();
    root.device.queue.submit([commandEncoder.finish()]);

    if (logResources) {
      logDataFromGPU(logResources);
    }

    if (internals.priors.performanceCallback) {
      void triggerPerformanceCallback({ root, priors: internals.priors });
    }
  }

  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void {
    const internals = this[$internal];
    const { root } = internals.core.options;

    if (internals.priors.externalRenderEncoder) {
      if (
        _lastAppliedRender.get(internals.priors.externalRenderEncoder) !== this
      ) {
        this._applyRenderState(internals.priors.externalRenderEncoder);
        this._setIndexBuffer(internals.priors.externalRenderEncoder);
        _lastAppliedRender.set(internals.priors.externalRenderEncoder, this);
      }
      internals.priors.externalRenderEncoder.drawIndexed(
        indexCount,
        instanceCount,
        firstIndex,
        baseVertex,
        firstInstance,
      );
      return;
    }

    if (internals.priors.externalEncoder) {
      const pass = this._createRenderPass(internals.priors.externalEncoder);
      this._applyRenderState(pass);
      this._setIndexBuffer(pass);
      pass.drawIndexed(
        indexCount,
        instanceCount,
        firstIndex,
        baseVertex,
        firstInstance,
      );
      pass.end();
      return;
    }

    const { logResources } = internals.core.unwrap();

    const commandEncoder = root.device.createCommandEncoder();
    const pass = this._createRenderPass(commandEncoder);
    this._applyRenderState(pass);
    this._setIndexBuffer(pass);
    pass.drawIndexed(
      indexCount,
      instanceCount,
      firstIndex,
      baseVertex,
      firstInstance,
    );
    pass.end();
    root.device.queue.submit([commandEncoder.finish()]);

    if (logResources) {
      logDataFromGPU(logResources);
    }

    if (internals.priors.performanceCallback) {
      void triggerPerformanceCallback({ root, priors: internals.priors });
    }
  }

  drawIndirect(
    indirectBuffer: TgpuBuffer<BaseData> | GPUBuffer,
    indirectOffset: GPUSize64 = 0,
  ): void {
    const internals = this[$internal];
    const { root } = internals.core.options;
    const rawBuffer = isGPUBuffer(indirectBuffer)
      ? indirectBuffer
      : root.unwrap(indirectBuffer);

    if (internals.priors.externalRenderEncoder) {
      if (
        _lastAppliedRender.get(internals.priors.externalRenderEncoder) !== this
      ) {
        this._applyRenderState(internals.priors.externalRenderEncoder);
        _lastAppliedRender.set(internals.priors.externalRenderEncoder, this);
      }
      internals.priors.externalRenderEncoder.drawIndirect(
        rawBuffer,
        indirectOffset,
      );
      return;
    }

    if (internals.priors.externalEncoder) {
      const pass = this._createRenderPass(internals.priors.externalEncoder);
      this._applyRenderState(pass);
      pass.drawIndirect(rawBuffer, indirectOffset);
      pass.end();
      return;
    }

    const { logResources } = internals.core.unwrap();

    const commandEncoder = root.device.createCommandEncoder();
    const pass = this._createRenderPass(commandEncoder);
    this._applyRenderState(pass);
    pass.drawIndirect(rawBuffer, indirectOffset);
    pass.end();
    root.device.queue.submit([commandEncoder.finish()]);

    if (logResources) {
      logDataFromGPU(logResources);
    }

    if (internals.priors.performanceCallback) {
      triggerPerformanceCallback({ root, priors: internals.priors });
    }
  }

  drawIndexedIndirect(
    indirectBuffer: TgpuBuffer<BaseData> | GPUBuffer,
    indirectOffset: GPUSize64 = 0,
  ): void {
    const internals = this[$internal];
    const { root } = internals.core.options;
    const rawBuffer = isGPUBuffer(indirectBuffer)
      ? indirectBuffer
      : root.unwrap(indirectBuffer);

    if (internals.priors.externalRenderEncoder) {
      if (
        _lastAppliedRender.get(internals.priors.externalRenderEncoder) !== this
      ) {
        this._applyRenderState(internals.priors.externalRenderEncoder);
        this._setIndexBuffer(internals.priors.externalRenderEncoder);
        _lastAppliedRender.set(internals.priors.externalRenderEncoder, this);
      }
      internals.priors.externalRenderEncoder.drawIndexedIndirect(
        rawBuffer,
        indirectOffset,
      );
      return;
    }

    if (internals.priors.externalEncoder) {
      const pass = this._createRenderPass(internals.priors.externalEncoder);
      this._applyRenderState(pass);
      this._setIndexBuffer(pass);
      pass.drawIndexedIndirect(rawBuffer, indirectOffset);
      pass.end();
      return;
    }

    const { logResources } = internals.core.unwrap();

    const commandEncoder = root.device.createCommandEncoder();
    const pass = this._createRenderPass(commandEncoder);
    this._applyRenderState(pass);
    this._setIndexBuffer(pass);
    pass.drawIndexedIndirect(rawBuffer, indirectOffset);
    pass.end();
    root.device.queue.submit([commandEncoder.finish()]);

    if (logResources) {
      logDataFromGPU(logResources);
    }

    if (internals.priors.performanceCallback) {
      triggerPerformanceCallback({ root, priors: internals.priors });
    }
  }
}

class RenderPipelineCore implements SelfResolvable {
  readonly [$internal] = true;
  private _memo: Memo | undefined;

  #latestFragmentOut: BaseData | undefined;

  constructor(public readonly options: RenderPipelineCoreOptions) {}

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const { slotBindings } = this.options;
    const { vertex, fragment, attribs = {} } = this.options.descriptor;
    this.#latestFragmentOut = undefined;

    const locations = matchUpVaryingLocations(
      (vertex as TgpuVertexFn | undefined)?.shell?.out,
      (fragment as TgpuFragmentFn | undefined)?.shell?.in,
      getName(vertex) ?? '<unnamed>',
      getName(fragment) ?? '<unnamed>',
    );

    return ctx.withVaryingLocations(
      locations,
      () =>
        ctx.withSlots(slotBindings, () => {
          let vertexOut: WgslStruct;
          if (typeof vertex === 'function') {
            const defaultAttribData = Object.fromEntries(
              Object.entries(attribs as Record<string, TgpuVertexAttrib>).map(
                ([key, value]) => [key, formatToWGSLType[value.format]],
              ),
            );
            vertexOut = ctx.resolve(
              new AutoVertexFn(vertex, defaultAttribData, locations),
            ).dataType as WgslStruct;
          } else {
            vertexOut = ctx.resolve(vertex).dataType as WgslStruct;
          }

          if (fragment) {
            let fragOut: Snippet;
            if (typeof fragment === 'function') {
              const varyings = Object.fromEntries(
                Object.entries(vertexOut.propTypes).filter(
                  ([, dataType]) => !isBuiltin(dataType),
                ),
              );
              fragOut = ctx.resolve(
                new AutoFragmentFn(fragment, varyings, locations),
              );
            } else {
              fragOut = ctx.resolve(fragment);
            }

            this.#latestFragmentOut = fragOut.dataType as BaseData;
          }
          return snip('', Void, /* origin */ 'runtime');
        }),
    );
  }

  toString() {
    return 'renderPipelineCore';
  }

  public unwrap(): Memo {
    if (this._memo !== undefined) {
      return this._memo;
    }

    const { root, descriptor: tgpuDescriptor } = this.options;
    const device = root.device;
    const enableExtensions = wgslExtensions.filter((extension) =>
      root.enabledFeatures.has(wgslExtensionToFeatureName[extension])
    );

    // Resolving code
    let resolutionResult: ResolutionResult;

    let resolveMeasure: PerformanceMeasure | undefined;
    const ns = namespace({ names: root.nameRegistrySetting });
    if (PERF?.enabled) {
      const resolveStart = performance.mark('typegpu:resolution:start');
      resolutionResult = resolve(this, {
        namespace: ns,
        enableExtensions,
        shaderGenerator: root.shaderGenerator,
        root,
      });
      resolveMeasure = performance.measure('typegpu:resolution', {
        start: resolveStart.name,
      });
    } else {
      resolutionResult = resolve(this, {
        namespace: ns,
        enableExtensions,
        shaderGenerator: root.shaderGenerator,
        root,
      });
    }

    const { code, usedBindGroupLayouts, catchall, logResources } =
      resolutionResult;

    if (catchall !== undefined) {
      usedBindGroupLayouts[catchall[0]]?.$name(
        `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
      );
    }

    const module = device.createShaderModule({
      label: `${getName(this) ?? '<unnamed>'} - Shader`,
      code,
    });

    const { vertex, fragment, attribs = {}, targets } = this.options.descriptor;
    const connectedAttribs = connectAttributesToShader(
      (vertex as TgpuVertexFn | undefined)?.shell?.in ?? {},
      attribs,
    );

    const fragmentOut = (fragment as TgpuFragmentFn)?.shell?.returnType ??
      this.#latestFragmentOut;
    const connectedTargets = fragmentOut
      ? connectTargetsToShader(fragmentOut, targets)
      : [null];

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

    this._memo = {
      pipeline: device.createRenderPipeline(descriptor),
      usedBindGroupLayouts,
      catchall,
      logResources,
      usedVertexLayouts: connectedAttribs.usedVertexLayouts,
      fragmentOut: this.#latestFragmentOut as BaseData,
    };

    if (PERF?.enabled) {
      void (async () => {
        const start = performance.mark('typegpu:compile-start');
        await device.queue.onSubmittedWorkDone();
        const compileMeasure = performance.measure('typegpu:compiled', {
          start: start.name,
        });

        PERF?.record('resolution', {
          resolveDuration: resolveMeasure?.duration,
          compileDuration: compileMeasure.duration,
          wgslSize: code.length,
        });
      })();
    }

    return this._memo;
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
      console.warn(
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

function isGPUCanvasContext(value: unknown): value is GPUCanvasContext {
  return typeof (value as GPUCanvasContext)?.getCurrentTexture === 'function';
}

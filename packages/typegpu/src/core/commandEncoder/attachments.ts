import type {
  WgslTexture,
  WgslTextureDepth2d,
  WgslTextureDepthMultisampled2d,
} from '../../data/texture.ts';
import { $internal } from '../../shared/symbols.ts';
import { isQuerySet, type TgpuQuerySet } from '../querySet/querySet.ts';
import { isGPUCanvasContext } from '../pipeline/typeGuards.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import {
  isTexture,
  isTextureView,
  type TextureInternals,
  type TgpuTextureRenderView,
  type TgpuTextureView,
} from '../texture/texture.ts';
import type { RenderFlag } from '../texture/usageExtension.ts';

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
   * render pass. If not provided, defaults to `{r: 0, g: 0, b: 0, a: 0}`. Ignored
   * if {@link GPURenderPassColorAttachment#loadOp} is not {@link GPULoadOp#"clear"}.
   * The components of {@link GPURenderPassColorAttachment#clearValue} are all double values.
   * They are converted to a texel value of texture format matching the render attachment.
   * If conversion fails, a validation error is generated.
   */
  clearValue?: readonly [number, number, number, number] | GPUColor;
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
   * The texture subresource that will be output to and read from for this
   * depth/stencil attachment.
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
   * number of LSBs as the number of bits in the stencil aspect of one texel of `view`.
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

export type AnyAttachmentView =
  | ColorAttachment['view']
  | NonNullable<ColorAttachment['resolveTarget']>
  | DepthStencilAttachment['view'];

export function unwrapAttachmentView(
  root: ExperimentalTgpuRoot,
  view: AnyAttachmentView,
): GPUTextureView {
  if (isTexture(view)) {
    return root.unwrap(view).createView();
  }
  if (isTextureView(view)) {
    return root.unwrap(view);
  }
  if (isGPUCanvasContext(view)) {
    return view.getCurrentTexture().createView();
  }
  return view as GPUTextureView;
}

export interface TgpuPassTimestampWrites {
  querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
  beginningOfPassWriteIndex?: number | undefined;
  endOfPassWriteIndex?: number | undefined;
}

export function unwrapTimestampWrites(
  root: ExperimentalTgpuRoot,
  timestampWrites: TgpuPassTimestampWrites,
): GPURenderPassTimestampWrites {
  const { querySet, beginningOfPassWriteIndex, endOfPassWriteIndex } = timestampWrites;

  const result: GPURenderPassTimestampWrites = {
    querySet: isQuerySet(querySet) ? root.unwrap(querySet) : querySet,
  };

  if (beginningOfPassWriteIndex !== undefined) {
    result.beginningOfPassWriteIndex = beginningOfPassWriteIndex;
  }
  if (endOfPassWriteIndex !== undefined) {
    result.endOfPassWriteIndex = endOfPassWriteIndex;
  }

  return result;
}

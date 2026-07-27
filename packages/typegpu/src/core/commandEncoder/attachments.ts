import { isQuerySet, type TgpuQuerySet } from '../querySet/querySet.ts';
import { isGPUCanvasContext } from '../pipeline/typeGuards.ts';
import type { ColorAttachment, DepthStencilAttachment } from '../pipeline/renderPipeline.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import { isTexture, isTextureView } from '../texture/texture.ts';

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

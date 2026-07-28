import {
  INTERNAL_applyBufferUsages,
  type TgpuBuffer,
  type TgpuBufferSoul,
  type UniformFlag,
} from '../core/buffer/buffer.ts';
import type { StorageFlag } from '../extension.ts';
import type { BaseData } from '../data/wgslTypes.ts';
import type { ExperimentalTgpuRoot } from '../core/root/rootTypes.ts';
import { TgpuBufferBindingImpl, type TgpuBufferBindingSoul } from '../core/buffer/bufferBinding.ts';
import { constant, type TgpuConstSoul } from '../core/constant/tgpuConstant.ts';
import {
  INTERNAL_restoreComputePipeline,
  type TgpuComputePipelineSoul,
} from '../core/pipeline/computePipeline.ts';
import {
  INTERNAL_restoreRenderPipeline,
  type TgpuRenderPipelineSoul,
} from '../core/pipeline/renderPipeline.ts';
import type { TgpuQuerySetSoul } from '../core/querySet/querySet.ts';
import { INTERNAL_restoreGuardedComputePipeline, INTERNAL_restoreRoot } from '../core/root/init.ts';
import type { TgpuGuardedComputePipelineSoul, TgpuRootSoul } from '../core/root/rootTypes.ts';
import type { TgpuSamplerSoul } from '../core/sampler/sampler.ts';
import { accessor, mutableAccessor } from '../core/slot/accessor.ts';
import { slot } from '../core/slot/slot.ts';
import type {
  TgpuAccessorSoul,
  TgpuMutableAccessor,
  TgpuSlotSoul,
} from '../core/slot/slotTypes.ts';
import { INTERNAL_createTexture, type TgpuTextureSoul } from '../core/texture/texture.ts';
import type { AllowedUsages } from '../core/texture/usageExtension.ts';
import { vertexLayout, type TgpuVertexLayoutSoul } from '../core/vertexLayout/vertexLayout.ts';
import { arrayOf } from '../data/array.ts';
import type { AnyData } from '../data/dataTypes.ts';
import { disarrayOf } from '../data/disarray.ts';
import { isDisarray } from '../data/dataTypes.ts';
import { isWgslArray, type AnyWgslData } from '../data/wgslTypes.ts';
import type { TextureProps } from '../core/texture/textureProps.ts';
import {
  INTERNAL_restoreBindGroup,
  INTERNAL_restoreBindGroupLayout,
  type TgpuBindGroupLayoutSoul,
  type TgpuBindGroupSoul,
} from '../tgpuBindGroupLayout.ts';
import type { WgslComparisonSamplerProps, WgslSamplerProps } from '../data/sampler.ts';
import type { TgpuSoul } from '../shared/soul.ts';
import type { RestoreContext } from './types.ts';

/** Every soul that can cross a device boundary, discriminated by `type` */
export type TgpuResourceSoul =
  | TgpuBufferSoul
  | TgpuBufferBindingSoul
  | TgpuTextureSoul
  | TgpuSamplerSoul
  | TgpuQuerySetSoul
  | TgpuBindGroupLayoutSoul
  | TgpuBindGroupSoul
  | TgpuVertexLayoutSoul
  | TgpuConstSoul
  | TgpuSlotSoul
  | TgpuAccessorSoul
  | TgpuComputePipelineSoul
  | TgpuRenderPipelineSoul
  | TgpuGuardedComputePipelineSoul
  | TgpuRootSoul;

type Restorer<TSoul extends TgpuSoul> = (soul: TSoul, ctx: RestoreContext) => unknown;

function restoreBufferBinding(soul: TgpuBufferBindingSoul) {
  return new TgpuBufferBindingImpl(
    soul.type,
    soul.buffer as TgpuBuffer<BaseData> & UniformFlag & StorageFlag,
  );
}

/**
 * The one place a soul turns back into a resource. Importing this module opts
 * into every restorer, so it is kept out of the resources themselves
 */
export const soulRestorers = {
  buffer: (soul: TgpuBufferSoul, ctx) => {
    const buffer = ctx.getRoot(soul.device).createBuffer(soul.dataType as AnyData, soul.raw);
    INTERNAL_applyBufferUsages(buffer, soul.usages);
    return buffer;
  },
  uniform: restoreBufferBinding,
  mutable: restoreBufferBinding,
  readonly: restoreBufferBinding,
  texture: (soul: TgpuTextureSoul, ctx) => {
    const texture = INTERNAL_createTexture(
      soul.props,
      ctx.getRoot(soul.device) as ExperimentalTgpuRoot,
      soul.raw,
    );
    if (soul.flagsOverridden) {
      texture.$overrideFlags(soul.flags);
    } else if (soul.usages.length > 0) {
      texture.$usage(...(soul.usages as AllowedUsages<TextureProps>[]));
    }
    return texture;
  },
  sampler: (soul: TgpuSamplerSoul, ctx) =>
    ctx.getRoot(soul.device).createSampler(soul.props as WgslSamplerProps),
  'sampler-comparison': (soul: TgpuSamplerSoul, ctx) =>
    ctx.getRoot(soul.device).createComparisonSampler(soul.props as WgslComparisonSamplerProps),
  'query-set': (soul: TgpuQuerySetSoul, ctx) =>
    ctx.getRoot(soul.device).createQuerySet(soul.queryType, soul.count, soul.raw),
  'bind-group-layout': (soul: TgpuBindGroupLayoutSoul) => INTERNAL_restoreBindGroupLayout(soul),
  'bind-group': INTERNAL_restoreBindGroup as Restorer<TgpuBindGroupSoul>,
  'vertex-layout': (soul: TgpuVertexLayoutSoul) => {
    const schema = soul.schema;
    if (isWgslArray(schema)) {
      const elementType = schema.elementType as AnyWgslData;
      return vertexLayout((count) => arrayOf(elementType, count), soul.stepMode);
    }
    if (isDisarray(schema)) {
      const elementType = schema.elementType as AnyData;
      return vertexLayout((count) => disarrayOf(elementType, count), soul.stepMode);
    }
    throw new Error('TypeGPU vertex layout payload could not be reconstructed.');
  },
  const: (soul: TgpuConstSoul) => constant(soul.dataType as AnyData, soul.value),
  slot: (soul: TgpuSlotSoul) => slot(soul.defaultValue),
  accessor: (soul: TgpuAccessorSoul) => accessor(soul.schema as AnyData, soul.defaultValue),
  'mutable-accessor': (soul: TgpuAccessorSoul) =>
    mutableAccessor(
      soul.schema as AnyData,
      soul.defaultValue as TgpuMutableAccessor.In<AnyData> | undefined,
    ),
  'compute-pipeline': INTERNAL_restoreComputePipeline as Restorer<TgpuComputePipelineSoul>,
  'render-pipeline': INTERNAL_restoreRenderPipeline as Restorer<TgpuRenderPipelineSoul>,
  'guarded-compute-pipeline':
    INTERNAL_restoreGuardedComputePipeline as Restorer<TgpuGuardedComputePipelineSoul>,
  root: INTERNAL_restoreRoot as Restorer<TgpuRootSoul>,
  // oxlint-disable-next-line typescript/no-explicit-any -- each restorer narrows its own soul
} satisfies Record<TgpuResourceSoul['type'], Restorer<any>>;

export type TransferableResourceType = TgpuResourceSoul['type'];

import type { TgpuBuffer, VertexFlag } from '../../core/buffer/buffer.ts';
import type { Disarray } from '../../data/dataTypes.ts';
import type { AnyWgslData, WgslArray } from '../../data/wgslTypes.ts';
import {
  MissingBindGroupsError,
  MissingVertexBuffersError,
} from '../../errors.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import { resolve } from '../../resolutionCtx.ts';
import { $getNameForward, $internal } from '../../shared/symbols.ts';
import type { AnyVertexAttribs } from '../../shared/vertexFormat.ts';
import {
  isBindGroupLayout,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import type { IOData, IOLayout } from '../function/fnTypes.ts';
import type { TgpuFragmentFn } from '../function/tgpuFragmentFn.ts';
import type { TgpuVertexFn } from '../function/tgpuVertexFn.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuSlot } from '../slot/slotTypes.ts';
import { isTexture, type TgpuTexture } from '../texture/texture.ts';
import type { Render } from '../texture/usageExtension.ts';
import { connectAttributesToShader } from '../vertexLayout/connectAttributesToShader.ts';
import {
  isVertexLayout,
  type TgpuVertexLayout,
} from '../vertexLayout/vertexLayout.ts';
import { connectAttachmentToShader } from './connectAttachmentToShader.ts';
import { connectTargetsToShader } from './connectTargetsToShader.ts';
import {
  createWithPerformanceCallback,
  createWithTimestampWrites,
  setupTimestampWrites,
  type Timeable,
  type TimestampWritesPriors,
  triggerPerformanceCallback,
} from './timeable.ts';
import type { TgpuQuerySet } from '../../core/querySet/querySet.ts';

interface RenderPipelineInternals {
  readonly core: RenderPipelineCore;
  readonly priors: TgpuRenderPipelinePriors & TimestampWritesPriors;
}

// ----------
// Public API
// ----------

export interface TgpuRenderPipeline<Output extends IOLayout = IOLayout>
  extends TgpuNamable, Timeable<TgpuRenderPipeline> {
  readonly [$internal]: RenderPipelineInternals;
  readonly resourceType: 'render-pipeline';

  with<TData extends WgslArray | Disarray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: TgpuBuffer<TData> & VertexFlag,
  ): TgpuRenderPipeline;
  with<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries>,
  ): TgpuRenderPipeline;

  withColorAttachment(
    attachment: FragmentOutToColorAttachment<Output>,
  ): TgpuRenderPipeline;

  withDepthStencilAttachment(
    attachment: DepthStencilAttachment,
  ): TgpuRenderPipeline;

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
}

export type FragmentOutToTargets<T extends IOLayout> = T extends IOData
  ? GPUColorTargetState
  : T extends Record<string, unknown>
    ? { [Key in keyof T]: GPUColorTargetState }
  : T extends { type: 'void' } ? Record<string, never>
  : never;

export type FragmentOutToColorAttachment<T extends IOLayout> = T extends IOData
  ? ColorAttachment
  : T extends Record<string, unknown> ? { [Key in keyof T]: ColorAttachment }
  : never;

export type AnyFragmentTargets =
  | GPUColorTargetState
  | Record<string, GPUColorTargetState>;

export interface ColorAttachment {
  /**
   * A {@link GPUTextureView} describing the texture subresource that will be output to for this
   * color attachment.
   */
  view: (TgpuTexture & Render) | GPUTextureView;
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
  resolveTarget?: GPUTextureView;
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
   */
  loadOp: GPULoadOp;
  /**
   * The store operation to perform on {@link GPURenderPassColorAttachment#view}
   * after executing the render pass.
   */
  storeOp: GPUStoreOp;
}

export interface DepthStencilAttachment {
  /**
   * A {@link GPUTextureView} | ({@link TgpuTexture} & {@link Render}) describing the texture subresource that will be output to
   * and read from for this depth/stencil attachment.
   */
  view: (TgpuTexture & Render) | GPUTextureView;
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
  branch: ExperimentalTgpuRoot;
  slotBindings: [TgpuSlot<unknown>, unknown][];
  vertexAttribs: AnyVertexAttribs;
  vertexFn: TgpuVertexFn;
  fragmentFn: TgpuFragmentFn;
  primitiveState: GPUPrimitiveState | undefined;
  depthStencilState: GPUDepthStencilState | undefined;
  targets: AnyFragmentTargets;
  multisampleState: GPUMultisampleState | undefined;
};

export function INTERNAL_createRenderPipeline(
  options: RenderPipelineCoreOptions,
) {
  return new TgpuRenderPipelineImpl(new RenderPipelineCore(options), {});
}

export function isRenderPipeline(value: unknown): value is TgpuRenderPipeline {
  const maybe = value as TgpuRenderPipeline | undefined;
  return maybe?.resourceType === 'render-pipeline' && !!maybe[$internal];
}

// --------------
// Implementation
// --------------

type TgpuRenderPipelinePriors = {
  readonly vertexLayoutMap?:
    | Map<TgpuVertexLayout, TgpuBuffer<AnyWgslData> & VertexFlag>
    | undefined;
  readonly bindGroupLayoutMap?:
    | Map<TgpuBindGroupLayout, TgpuBindGroup>
    | undefined;
  readonly colorAttachment?: AnyFragmentColorAttachment | undefined;
  readonly depthStencilAttachment?: DepthStencilAttachment | undefined;
} & TimestampWritesPriors;

type Memo = {
  pipeline: GPURenderPipeline;
  usedBindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | undefined;
};

class TgpuRenderPipelineImpl implements TgpuRenderPipeline {
  public readonly [$internal]: RenderPipelineInternals;
  public readonly resourceType = 'render-pipeline';
  [$getNameForward]: RenderPipelineCore;

  constructor(core: RenderPipelineCore, priors: TgpuRenderPipelinePriors) {
    this[$internal] = {
      core,
      priors,
    };
    this[$getNameForward] = core;
  }

  $name(label: string): this {
    setName(this[$internal].core, label);
    return this;
  }

  with<TData extends WgslArray<AnyWgslData>>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: TgpuBuffer<TData> & VertexFlag,
  ): TgpuRenderPipeline;
  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuRenderPipeline;
  with(
    definition: TgpuVertexLayout | TgpuBindGroupLayout,
    resource: (TgpuBuffer<AnyWgslData> & VertexFlag) | TgpuBindGroup,
  ): TgpuRenderPipeline {
    const internals = this[$internal];

    if (isBindGroupLayout(definition)) {
      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
        bindGroupLayoutMap: new Map([
          ...(internals.priors.bindGroupLayoutMap ?? []),
          [definition, resource as TgpuBindGroup],
        ]),
      });
    }

    if (isVertexLayout(definition)) {
      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
        vertexLayoutMap: new Map([
          ...(internals.priors.vertexLayoutMap ?? []),
          [definition, resource as TgpuBuffer<AnyWgslData> & VertexFlag],
        ]),
      });
    }

    throw new Error('Unsupported value passed into .with()');
  }

  withColorAttachment(
    attachment: AnyFragmentColorAttachment,
  ): TgpuRenderPipeline {
    const internals = this[$internal];

    return new TgpuRenderPipelineImpl(internals.core, {
      ...internals.priors,
      colorAttachment: attachment,
    });
  }

  withDepthStencilAttachment(
    attachment: DepthStencilAttachment,
  ): TgpuRenderPipeline {
    const internals = this[$internal];

    return new TgpuRenderPipelineImpl(internals.core, {
      ...internals.priors,
      depthStencilAttachment: attachment,
    });
  }

  withPerformanceCallback(
    callback: (start: bigint, end: bigint) => void | Promise<void>,
  ): TgpuRenderPipeline {
    const internals = this[$internal];
    const newPriors = createWithPerformanceCallback(
      internals.priors,
      callback,
      internals.core.options.branch,
    );
    return new TgpuRenderPipelineImpl(internals.core, newPriors);
  }

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): TgpuRenderPipeline {
    const internals = this[$internal];
    const newPriors = createWithTimestampWrites(
      internals.priors,
      options,
      internals.core.options.branch,
    );
    return new TgpuRenderPipelineImpl(internals.core, newPriors);
  }

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    const internals = this[$internal];

    const memo = internals.core.unwrap();
    const { branch, fragmentFn } = internals.core.options;

    const colorAttachments = connectAttachmentToShader(
      fragmentFn.shell.targets,
      internals.priors.colorAttachment ?? {},
    ).map((attachment) => {
      if (isTexture(attachment.view)) {
        return {
          ...attachment,
          view: branch.unwrap(attachment.view).createView(),
        };
      }

      return attachment;
    }) as GPURenderPassColorAttachment[];

    const renderPassDescriptor: GPURenderPassDescriptor = {
      label: getName(internals.core) ?? '<unnamed>',
      colorAttachments,
      ...setupTimestampWrites(
        internals.priors,
        branch,
      ),
    };

    if (internals.priors.depthStencilAttachment !== undefined) {
      const attachment = internals.priors.depthStencilAttachment;
      if (isTexture(attachment.view)) {
        renderPassDescriptor.depthStencilAttachment = {
          ...attachment,
          view: branch.unwrap(attachment.view).createView(),
        };
      } else {
        renderPassDescriptor.depthStencilAttachment =
          attachment as GPURenderPassDepthStencilAttachment;
      }
    }

    const pass = branch.commandEncoder.beginRenderPass(renderPassDescriptor);

    pass.setPipeline(memo.pipeline);

    const missingBindGroups = new Set(memo.usedBindGroupLayouts);

    memo.usedBindGroupLayouts.forEach((layout, idx) => {
      if (memo.catchall && idx === memo.catchall[0]) {
        // Catch-all
        pass.setBindGroup(idx, branch.unwrap(memo.catchall[1]));
        missingBindGroups.delete(layout);
      } else {
        const bindGroup = internals.priors.bindGroupLayoutMap?.get(layout);
        if (bindGroup !== undefined) {
          missingBindGroups.delete(layout);
          pass.setBindGroup(idx, branch.unwrap(bindGroup));
        }
      }
    });

    const missingVertexLayouts = new Set(internals.core.usedVertexLayouts);

    const usedVertexLayouts = internals.core.usedVertexLayouts;
    usedVertexLayouts.forEach((vertexLayout, idx) => {
      const buffer = internals.priors.vertexLayoutMap?.get(vertexLayout);
      if (buffer) {
        missingVertexLayouts.delete(vertexLayout);
        pass.setVertexBuffer(idx, branch.unwrap(buffer));
      }
    });

    if (missingBindGroups.size > 0) {
      throw new MissingBindGroupsError(missingBindGroups);
    }

    if (missingVertexLayouts.size > 0) {
      throw new MissingVertexBuffersError(missingVertexLayouts);
    }

    pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);

    pass.end();

    internals.priors.performanceCallback
      ? triggerPerformanceCallback({
        root: branch,
        priors: internals.priors,
      })
      : branch.flush();
  }
}

class RenderPipelineCore {
  public readonly usedVertexLayouts: TgpuVertexLayout[];

  private _memo: Memo | undefined;
  private readonly _vertexBufferLayouts: GPUVertexBufferLayout[];
  private readonly _targets: GPUColorTargetState[];

  constructor(public readonly options: RenderPipelineCoreOptions) {
    const connectedAttribs = connectAttributesToShader(
      options.vertexFn.shell.attributes[0],
      options.vertexAttribs,
    );

    this._vertexBufferLayouts = connectedAttribs.bufferDefinitions;
    this.usedVertexLayouts = connectedAttribs.usedVertexLayouts;

    this._targets = connectTargetsToShader(
      options.fragmentFn.shell.targets,
      options.targets,
    );
  }

  public unwrap(): Memo {
    if (this._memo === undefined) {
      const {
        branch,
        vertexFn,
        fragmentFn,
        slotBindings,
        primitiveState,
        depthStencilState,
        multisampleState,
      } = this.options;

      // Resolving code
      const { code, usedBindGroupLayouts, catchall } = resolve(
        {
          '~resolve': (ctx) => {
            ctx.withSlots(slotBindings, () => {
              ctx.resolve(vertexFn);
              ctx.resolve(fragmentFn);
            });
            return '';
          },

          toString: () => `renderPipeline:${getName(this) ?? '<unnamed>'}`,
        },
        {
          names: branch.nameRegistry,
        },
      );

      if (catchall !== undefined) {
        usedBindGroupLayouts[catchall[0]]?.$name(
          `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
        );
      }

      const device = branch.device;

      const module = device.createShaderModule({
        label: `${getName(this) ?? '<unnamed>'} - Shader`,
        code,
      });

      const descriptor: GPURenderPipelineDescriptor = {
        layout: device.createPipelineLayout({
          label: `${getName(this) ?? '<unnamed>'} - Pipeline Layout`,
          bindGroupLayouts: usedBindGroupLayouts.map((l) => branch.unwrap(l)),
        }),
        vertex: {
          module,
          buffers: this._vertexBufferLayouts,
        },
        fragment: {
          module,
          targets: this._targets,
        },
      };

      const label = getName(this);
      if (label !== undefined) {
        descriptor.label = label;
      }

      if (primitiveState) {
        descriptor.primitive = primitiveState;
      }

      if (depthStencilState) {
        descriptor.depthStencil = depthStencilState;
      }

      if (multisampleState) {
        descriptor.multisample = multisampleState;
      }

      this._memo = {
        pipeline: device.createRenderPipeline(descriptor),
        usedBindGroupLayouts,
        catchall,
      };
    }

    return this._memo;
  }
}

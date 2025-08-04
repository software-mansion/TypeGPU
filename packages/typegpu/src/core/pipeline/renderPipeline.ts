import type {
  IndexFlag,
  TgpuBuffer,
  VertexFlag,
} from '../../core/buffer/buffer.ts';

import type { TgpuQuerySet } from '../../core/querySet/querySet.ts';
import { isBuiltin } from '../../data/attributes.ts';
import { type Disarray, getCustomLocation } from '../../data/dataTypes.ts';
import {
  type AnyWgslData,
  isWgslData,
  type U16,
  type U32,
  type WgslArray,
} from '../../data/wgslTypes.ts';
import {
  MissingBindGroupsError,
  MissingVertexBuffersError,
} from '../../errors.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import { type ResolutionResult, resolve } from '../../resolutionCtx.ts';
import { $getNameForward, $internal } from '../../shared/symbols.ts';
import type { AnyVertexAttribs } from '../../shared/vertexFormat.ts';
import {
  isBindGroupLayout,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { IOData, IOLayout, IORecord } from '../function/fnTypes.ts';
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
import { isGPUBuffer } from '../../types.ts';
import { sizeOf } from '../../data/index.ts';
import {
  createWithPerformanceCallback,
  createWithTimestampWrites,
  setupTimestampWrites,
  type Timeable,
  type TimestampWritesPriors,
  triggerPerformanceCallback,
} from './timeable.ts';
import { PERF } from '../../shared/meta.ts';

interface RenderPipelineInternals {
  readonly core: RenderPipelineCore;
  readonly priors: TgpuRenderPipelinePriors & TimestampWritesPriors;
}

// ----------
// Public API
// ----------

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

export interface TgpuRenderPipeline<Output extends IOLayout = IOLayout>
  extends TgpuNamable, SelfResolvable, Timeable {
  readonly [$internal]: RenderPipelineInternals;
  readonly resourceType: 'render-pipeline';
  readonly hasIndexBuffer: boolean;

  with<TData extends WgslArray | Disarray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: TgpuBuffer<TData> & VertexFlag,
  ): this;
  with<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries>,
  ): this;

  withColorAttachment(
    attachment: FragmentOutToColorAttachment<Output>,
  ): this;

  withDepthStencilAttachment(
    attachment: DepthStencilAttachment,
  ): this;

  withIndexBuffer(
    buffer: TgpuBuffer<AnyWgslData> & IndexFlag,
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
  primitiveState:
    | GPUPrimitiveState
    | Omit<GPUPrimitiveState, 'stripIndexFormat'> & {
      stripIndexFormat?: U32 | U16;
    }
    | undefined;
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
  readonly indexBuffer?:
    | {
      buffer: TgpuBuffer<AnyWgslData> & IndexFlag | GPUBuffer;
      indexFormat: GPUIndexFormat;
      offsetBytes?: number | undefined;
      sizeBytes?: number | undefined;
    }
    | undefined;
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
  public readonly hasIndexBuffer: boolean = false;

  constructor(core: RenderPipelineCore, priors: TgpuRenderPipelinePriors) {
    this[$internal] = {
      core,
      priors,
    };
    this[$getNameForward] = core;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    return ctx.resolve(this[$internal].core);
  }

  toString(): string {
    return `renderPipeline:${getName(this) ?? '<unnamed>'}`;
  }

  $name(label: string): this {
    setName(this[$internal].core, label);
    return this;
  }

  with<TData extends WgslArray<AnyWgslData>>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: TgpuBuffer<TData> & VertexFlag,
  ): this;
  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): this;
  with(
    definition: TgpuVertexLayout | TgpuBindGroupLayout,
    resource: (TgpuBuffer<AnyWgslData> & VertexFlag) | TgpuBindGroup,
  ): this {
    const internals = this[$internal];

    if (isBindGroupLayout(definition)) {
      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
        bindGroupLayoutMap: new Map([
          ...(internals.priors.bindGroupLayoutMap ?? []),
          [definition, resource as TgpuBindGroup],
        ]),
      }) as this;
    }

    if (isVertexLayout(definition)) {
      return new TgpuRenderPipelineImpl(internals.core, {
        ...internals.priors,
        vertexLayoutMap: new Map([
          ...(internals.priors.vertexLayoutMap ?? []),
          [definition, resource as TgpuBuffer<AnyWgslData> & VertexFlag],
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
      internals.core.options.branch,
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
      internals.core.options.branch,
    );
    return new TgpuRenderPipelineImpl(internals.core, newPriors) as this;
  }

  withColorAttachment(
    attachment: AnyFragmentColorAttachment,
  ): this {
    const internals = this[$internal];

    return new TgpuRenderPipelineImpl(internals.core, {
      ...internals.priors,
      colorAttachment: attachment,
    }) as this;
  }

  withDepthStencilAttachment(
    attachment: DepthStencilAttachment,
  ): this {
    const internals = this[$internal];

    return new TgpuRenderPipelineImpl(internals.core, {
      ...internals.priors,
      depthStencilAttachment: attachment,
    }) as this;
  }

  withIndexBuffer(
    buffer: TgpuBuffer<AnyWgslData> & IndexFlag,
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
    buffer: TgpuBuffer<AnyWgslData> & IndexFlag | GPUBuffer,
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
      'u32': 'uint32',
      'u16': 'uint16',
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

  private setupRenderPass(): GPURenderPassEncoder {
    const internals = this[$internal];
    const memo = internals.core.unwrap();
    const { branch, fragmentFn } = internals.core.options;

    const colorAttachments = connectAttachmentToShader(
      fragmentFn.shell.out,
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

    return pass;
  }

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    const internals = this[$internal];
    const pass = this.setupRenderPass();
    const { branch } = internals.core.options;

    pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);

    pass.end();

    internals.priors.performanceCallback
      ? triggerPerformanceCallback({
        root: branch,
        priors: internals.priors,
      })
      : branch.flush();
  }

  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void {
    const internals = this[$internal];

    if (!internals.priors.indexBuffer) {
      throw new Error('No index buffer set for this render pipeline.');
    }

    const { buffer, indexFormat, offsetBytes, sizeBytes } =
      internals.priors.indexBuffer;

    const pass = this.setupRenderPass();
    const { branch } = internals.core.options;

    if (isGPUBuffer(buffer)) {
      pass.setIndexBuffer(buffer, indexFormat, offsetBytes, sizeBytes);
    } else {
      pass.setIndexBuffer(
        branch.unwrap(buffer),
        indexFormat,
        offsetBytes,
        sizeBytes,
      );
    }

    pass.drawIndexed(
      indexCount,
      instanceCount,
      firstIndex,
      baseVertex,
      firstInstance,
    );

    pass.end();

    internals.priors.performanceCallback
      ? triggerPerformanceCallback({
        root: branch,
        priors: internals.priors,
      })
      : branch.flush();
  }
}

class RenderPipelineCore implements SelfResolvable {
  public readonly usedVertexLayouts: TgpuVertexLayout[];

  private _memo: Memo | undefined;
  private readonly _vertexBufferLayouts: GPUVertexBufferLayout[];
  private readonly _targets: GPUColorTargetState[];

  constructor(public readonly options: RenderPipelineCoreOptions) {
    const connectedAttribs = connectAttributesToShader(
      options.vertexFn.shell.in ?? {},
      options.vertexAttribs,
    );

    this._vertexBufferLayouts = connectedAttribs.bufferDefinitions;
    this.usedVertexLayouts = connectedAttribs.usedVertexLayouts;

    this._targets = connectTargetsToShader(
      options.fragmentFn.shell.out,
      options.targets,
    );
  }

  '~resolve'(ctx: ResolutionCtx) {
    const {
      vertexFn,
      fragmentFn,
      slotBindings,
    } = this.options;

    const locations = matchUpVaryingLocations(
      vertexFn.shell.out,
      fragmentFn.shell.in,
      getName(vertexFn) ?? '<unnamed>',
      getName(fragmentFn) ?? '<unnamed>',
    );

    return ctx.withVaryingLocations(
      locations,
      () =>
        ctx.withSlots(slotBindings, () => {
          ctx.resolve(vertexFn);
          ctx.resolve(fragmentFn);
          return '';
        }),
    );
  }

  toString() {
    return 'renderPipelineCore';
  }

  public unwrap(): Memo {
    if (this._memo === undefined) {
      const {
        branch,
        primitiveState,
        depthStencilState,
        multisampleState,
      } = this.options;
      const device = branch.device;

      // Resolving code
      let resolutionResult: ResolutionResult;

      let resolveMeasure: PerformanceMeasure | undefined;
      if (PERF?.enabled) {
        const resolveStart = performance.mark('typegpu:resolution:start');
        resolutionResult = resolve(this, {
          names: branch.nameRegistry,
        });
        resolveMeasure = performance.measure('typegpu:resolution', {
          start: resolveStart.name,
        });
      } else {
        resolutionResult = resolve(this, {
          names: branch.nameRegistry,
        });
      }

      const { code, usedBindGroupLayouts, catchall } = resolutionResult;

      if (catchall !== undefined) {
        usedBindGroupLayouts[catchall[0]]?.$name(
          `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
        );
      }

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
        if (isWgslData(primitiveState.stripIndexFormat)) {
          descriptor.primitive = {
            ...primitiveState,
            stripIndexFormat: {
              'u32': 'uint32',
              'u16': 'uint16',
            }[primitiveState.stripIndexFormat.type] as GPUIndexFormat,
          };
        } else {
          descriptor.primitive = primitiveState as GPUPrimitiveState;
        }
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

      if (PERF?.enabled) {
        (async () => {
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
    }

    return this._memo;
  }
}

/**
 * Assumes vertexOut and fragmentIn are matching when it comes to the keys, that is fragmentIn's keyset is a subset of vertexOut's
 * Logs a warning, when they don't match in terms of custom locations
 */
export function matchUpVaryingLocations(
  vertexOut: IORecord,
  fragmentIn: IORecord | undefined,
  vertexFnName: string,
  fragmentFnName: string,
) {
  const locations: Record<
    string,
    number
  > = {};
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

  for (const [key, value] of Object.entries(fragmentIn ?? {})) {
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

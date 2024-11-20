import type { TgpuBuffer, Vertex } from '../../core/buffer/buffer';
import type { TgpuArray, Vec4f } from '../../data';
import { MissingBindGroupError } from '../../errors';
import type { TgpuNamable } from '../../namable';
import { resolve } from '../../resolutionCtx';
import type { AnyVertexAttribs } from '../../shared/vertexFormat';
import {
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  isBindGroupLayout,
} from '../../tgpuBindGroupLayout';
import type { AnyTgpuData } from '../../types';
import type { IOData, IOLayout } from '../function/fnTypes';
import type { TgpuFragmentFn } from '../function/tgpuFragmentFn';
import type { TgpuVertexFn } from '../function/tgpuVertexFn';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';
import { type TgpuTexture, isTexture } from '../texture/texture';
import type { Render } from '../texture/usageExtension';
import { connectAttributesToShader } from '../vertexLayout/connectAttributesToShader';
import {
  type TgpuVertexLayout,
  isVertexLayout,
} from '../vertexLayout/vertexLayout';
import { connectAttachmentToShader } from './connectAttachmentToShader';
import { connectTargetsToShader } from './connectTargetsToShader';

// ----------
// Public API
// ----------

export interface TgpuRenderPipeline<Output extends IOLayout = IOLayout>
  extends TgpuNamable {
  readonly resourceType: 'render-pipeline';
  readonly label: string | undefined;

  with<TData extends TgpuArray<AnyTgpuData>>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: TgpuBuffer<TData> & Vertex,
  ): TgpuRenderPipeline;
  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuRenderPipeline;

  withColorAttachment(
    attachment: FragmentOutToColorAttachment<Output>,
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
    : never;

export type FragmentOutToColorAttachment<T extends IOLayout> = T extends IOData
  ? ColorAttachment
  : T extends Record<string, unknown>
    ? { [Key in keyof T]: ColorAttachment }
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

export type AnyFragmentColorAttachment =
  | ColorAttachment
  | Record<string, ColorAttachment>;

export function INTERNAL_createRenderPipeline(
  branch: ExperimentalTgpuRoot,
  vertexAttribs: AnyVertexAttribs,
  vertexFn: TgpuVertexFn,
  fragmentFn: TgpuFragmentFn,
  targets: AnyFragmentTargets,
) {
  return new TgpuRenderPipelineImpl(
    new RenderPipelineCore(
      branch,
      vertexAttribs,
      vertexFn,
      fragmentFn,
      targets,
    ),
    {},
  );
}

// --------------
// Implementation
// --------------

type TgpuRenderPipelinePriors = {
  readonly vertexLayoutMap?:
    | Map<TgpuVertexLayout, TgpuBuffer<AnyTgpuData> & Vertex>
    | undefined;
  readonly bindGroupLayoutMap?:
    | Map<TgpuBindGroupLayout, TgpuBindGroup>
    | undefined;
  readonly colorAttachment?: AnyFragmentColorAttachment | undefined;
};

type Memo = {
  pipeline: GPURenderPipeline;
  bindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup];
};

class TgpuRenderPipelineImpl implements TgpuRenderPipeline {
  public readonly resourceType = 'render-pipeline';

  constructor(
    private readonly _core: RenderPipelineCore,
    private readonly _priors: TgpuRenderPipelinePriors,
  ) {}

  get label() {
    return this._core.label;
  }

  $name(label?: string | undefined): this {
    this._core.label = label;
    return this;
  }

  with<TData extends TgpuArray<AnyTgpuData>>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: TgpuBuffer<TData> & Vertex,
  ): TgpuRenderPipeline;
  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuRenderPipeline;
  with(
    definition: TgpuVertexLayout | TgpuBindGroupLayout,
    resource: (TgpuBuffer<AnyTgpuData> & Vertex) | TgpuBindGroup,
  ): TgpuRenderPipeline {
    if (isBindGroupLayout(definition)) {
      return new TgpuRenderPipelineImpl(this._core, {
        ...this._priors,
        bindGroupLayoutMap: new Map([
          ...(this._priors.bindGroupLayoutMap ?? []),
          [definition, resource as TgpuBindGroup],
        ]),
      });
    }

    if (isVertexLayout(definition)) {
      return new TgpuRenderPipelineImpl(this._core, {
        ...this._priors,
        vertexLayoutMap: new Map([
          ...(this._priors.vertexLayoutMap ?? []),
          [definition, resource as TgpuBuffer<AnyTgpuData> & Vertex],
        ]),
      });
    }

    throw new Error('Unsupported value passed into .with()');
  }

  withColorAttachment(
    attachment: AnyFragmentColorAttachment,
  ): TgpuRenderPipeline {
    return new TgpuRenderPipelineImpl(this._core, {
      ...this._priors,
      colorAttachment: attachment,
    });
  }

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    const memo = this._core.unwrap();

    const colorAttachments = connectAttachmentToShader(
      this._core.fragmentFn.shell.returnType,
      this._priors.colorAttachment ?? {},
    ).map((attachment) => {
      if (isTexture(attachment.view)) {
        return {
          ...attachment,
          view: this._core.branch.unwrap(attachment.view).createView(),
        };
      }

      return attachment;
    }) as GPURenderPassColorAttachment[];

    const pass = this._core.branch.commandEncoder.beginRenderPass({
      label: this._core.label ?? '',
      colorAttachments,
    });

    pass.setPipeline(memo.pipeline);

    memo.bindGroupLayouts.forEach((layout, idx) => {
      if (idx === memo.catchall[0]) {
        // Catch-all
        pass.setBindGroup(idx, this._core.branch.unwrap(memo.catchall[1]));
      } else {
        const bindGroup = this._priors.bindGroupLayoutMap?.get(layout);
        if (bindGroup === undefined) {
          throw new MissingBindGroupError(layout.label);
        }
        pass.setBindGroup(idx, this._core.branch.unwrap(bindGroup));
      }
    });

    this._core.usedVertexLayouts.forEach((vertexLayout, idx) => {
      const buffer = this._priors.vertexLayoutMap?.get(vertexLayout);
      if (!buffer) {
        throw new Error(
          `Missing vertex buffer for layout '${vertexLayout.label ?? '<unnamed>'}'. Please provide it using pipeline.with(layout, buffer).(...)`,
        );
      }
      pass.setVertexBuffer(idx, this._core.branch.unwrap(buffer));
    });

    pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    pass.end();
  }
}

class RenderPipelineCore {
  public label: string | undefined;
  public readonly usedVertexLayouts: TgpuVertexLayout[];

  private _memo: Memo | undefined;
  private readonly _vertexBufferLayouts: GPUVertexBufferLayout[];
  private readonly _targets: GPUColorTargetState[];

  constructor(
    public readonly branch: ExperimentalTgpuRoot,
    private readonly _vertexAttribs: AnyVertexAttribs,
    public readonly vertexFn: TgpuVertexFn<IOLayout, IOLayout>,
    public readonly fragmentFn: TgpuFragmentFn<IOLayout, IOLayout<Vec4f>>,
    targets: AnyFragmentTargets,
  ) {
    const connectedAttribs = connectAttributesToShader(
      this.vertexFn.shell.argTypes[0],
      this._vertexAttribs,
    );

    this._vertexBufferLayouts = connectedAttribs.bufferDefinitions;
    this.usedVertexLayouts = connectedAttribs.usedVertexLayouts;

    this._targets = connectTargetsToShader(
      this.fragmentFn.shell.returnType,
      targets,
    );
  }

  public unwrap(): Memo {
    if (this._memo === undefined) {
      // Resolving code
      const { code, bindGroupLayouts, catchall } = resolve(
        {
          resolve: (ctx) => {
            ctx.resolve(this.vertexFn);
            ctx.resolve(this.fragmentFn);
            return '';
          },
        },
        {
          names: this.branch.nameRegistry,
          jitTranspiler: this.branch.jitTranspiler,
        },
      );

      const device = this.branch.device;

      const module = device.createShaderModule({
        label: `${this.label ?? '<unnamed>'} - Shader`,
        code,
      });

      this._memo = {
        pipeline: device.createRenderPipeline({
          label: this.label ?? '<unnamed>',
          layout: device.createPipelineLayout({
            label: `${this.label ?? '<unnamed>'} - Pipeline Layout`,
            bindGroupLayouts: bindGroupLayouts.map((l) =>
              this.branch.unwrap(l),
            ),
          }),
          vertex: {
            module,
            buffers: this._vertexBufferLayouts,
          },
          fragment: {
            module,
            targets: this._targets,
          },
        }),
        bindGroupLayouts,
        catchall,
      };
    }

    return this._memo;
  }
}

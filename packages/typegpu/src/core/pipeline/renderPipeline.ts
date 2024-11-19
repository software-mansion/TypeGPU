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
import type { IOLayout } from '../function/fnTypes';
import type { TgpuFragmentFn } from '../function/tgpuFragmentFn';
import type { TgpuVertexFn } from '../function/tgpuVertexFn';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';
import { connectAttributesToShader } from '../vertexLayout/connectAttributesToShader';
import {
  type TgpuVertexLayout,
  isVertexLayout,
} from '../vertexLayout/vertexLayout';

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
  ): TgpuRenderPipeline<Output>;
  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuRenderPipeline<Output>;

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
}

export type FragmentOutToTargets<T> = T extends {
  kind: string;
}
  ? {
      /**
       * The GPUTextureFormat of this color target. The pipeline will only be compatible with GPURenderPassEncoders
       * which use a GPUTextureView of this format in the corresponding color attachment.
       */
      format: GPUTextureFormat;
      /**
       * The blending behavior for this color target. If left undefined, disables blending for this color target.
       */
      blend?: GPUBlendState | undefined;
      /**
       * Bitmask controlling which channels are are written to when drawing to this color target.
       * @default 0xF
       */
      writeMask?: GPUColorWriteFlags | undefined;
    }
  : T extends Record<string, unknown>
    ? { [Key in keyof T]: FragmentOutToTargets<T[Key]> }
    : never;

export function INTERNAL_createRenderPipeline(
  branch: ExperimentalTgpuRoot,
  vertexAttribs: AnyVertexAttribs,
  vertexFn: TgpuVertexFn,
  fragmentFn: TgpuFragmentFn,
) {
  return new TgpuRenderPipelineImpl(
    new RenderPipelineCore(branch, vertexAttribs, vertexFn, fragmentFn),
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
        bindGroupLayoutMap: new Map([
          ...(this._priors.bindGroupLayoutMap ?? []),
          [definition, resource as TgpuBindGroup],
        ]),
        vertexLayoutMap: this._priors.vertexLayoutMap,
      });
    }

    if (isVertexLayout(definition)) {
      return new TgpuRenderPipelineImpl(this._core, {
        bindGroupLayoutMap: this._priors.bindGroupLayoutMap,
        vertexLayoutMap: new Map([
          ...(this._priors.vertexLayoutMap ?? []),
          [definition, resource as TgpuBuffer<AnyTgpuData> & Vertex],
        ]),
      });
    }

    throw new Error('Unsupported value passed into .with()');
  }

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    const memo = this._core.unwrap();

    const pass = this._core.branch.commandEncoder.beginRenderPass({
      label: this._core.label ?? '',
      colorAttachments: [], // TODO: Add color attachments
    });

    pass.setPipeline(memo.pipeline);

    let idx = 0;
    for (const layout of memo.bindGroupLayouts) {
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

      idx++;
    }

    // pass.setVertexBuffer(); // TODO: Set vertex buffers

    pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    pass.end();
  }
}

class RenderPipelineCore {
  public label: string | undefined;
  public readonly vertexLayoutToIdxMap: Map<TgpuVertexLayout, number>;

  private _memo: Memo | undefined;
  private readonly _vertexBufferLayouts: GPUVertexBufferLayout[];

  constructor(
    public readonly branch: ExperimentalTgpuRoot,
    private readonly _vertexAttribs: AnyVertexAttribs,
    private readonly _vertexFn: TgpuVertexFn<IOLayout, IOLayout>,
    private readonly _fragmentFn: TgpuFragmentFn<IOLayout, IOLayout<Vec4f>>,
  ) {
    const connectedAttribs = connectAttributesToShader(
      this._vertexFn.shell.argTypes[0],
      this._vertexAttribs,
    );

    this._vertexBufferLayouts = connectedAttribs.bufferDefinitions;
    this.vertexLayoutToIdxMap = connectedAttribs.layoutToIdxMap;
  }

  public unwrap(): Memo {
    if (this._memo === undefined) {
      // Resolving code
      const { code, bindGroupLayouts, catchall } = resolve(
        {
          resolve: (ctx) => {
            ctx.resolve(this._vertexFn);
            ctx.resolve(this._fragmentFn);
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
            targets: [], // TODO: Add targets
          },
        }),
        bindGroupLayouts,
        catchall,
      };
    }

    return this._memo;
  }
}

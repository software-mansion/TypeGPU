import type { TgpuNamable } from '../../namable';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';

// ----------
// Public API
// ----------

export interface TgpuRenderPipeline extends TgpuNamable {
  readonly label: string | undefined;

  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuRenderPipeline;

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
}

export function INTERNAL_createRenderPipeline(branch: ExperimentalTgpuRoot) {
  return new TgpuRenderPipelineImpl(branch, {});
}

// --------------
// Implementation
// --------------

type TgpuRenderPipelinePriors = {
  readonly bindGroupLayoutMap?: Map<TgpuBindGroupLayout, TgpuBindGroup>;
};

class TgpuRenderPipelineImpl implements TgpuRenderPipeline {
  private _label: string | undefined;

  constructor(
    private readonly _branch: ExperimentalTgpuRoot,
    private readonly _priors: TgpuRenderPipelinePriors,
  ) {}

  get label() {
    return this._label;
  }

  $name(label?: string | undefined): this {
    this._label = label;
    return this;
  }

  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuRenderPipeline {
    return new TgpuRenderPipelineImpl(this._branch, {
      bindGroupLayoutMap: new Map([
        ...(this._priors.bindGroupLayoutMap ?? []),
        [bindGroupLayout, bindGroup],
      ]),
    });
  }

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    const pass = this._branch.commandEncoder.beginRenderPass({
      label: this._label ?? '',
      colorAttachments: [], // TODO: Add color attachments
    });
    // pass.setPipeline(); // TODO: Set pipeline
    // pass.setBindGroup(); // TODO: Set bind groups
    // pass.setVertexBuffer(); // TODO: Set vertex buffers

    pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    pass.end();
  }
}

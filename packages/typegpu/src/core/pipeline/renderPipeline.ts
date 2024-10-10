import type { TgpuNamable } from '../../namable';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout';
import type { TgpuRoot } from '../../tgpuRoot';

// ----------
// Public API
// ----------

export interface TgpuRenderPipeline extends TgpuNamable {
  readonly label: string | undefined;

  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuRenderPipeline;

  draw(): void;
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
    private readonly _branch: TgpuRoot,
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

  draw(): void {
    const pass = this._branch.commandEncoder.beginRenderPass({
      label: this._label ?? '',
      colorAttachments: [],
    });
  }
}

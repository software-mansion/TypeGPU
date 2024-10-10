import type { TgpuNamable } from '../../namable';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout';
import type { TgpuRoot } from '../../tgpuRoot';

// ----------
// Public API
// ----------

export interface TgpuComputePipeline extends TgpuNamable {
  readonly label: string | undefined;

  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuComputePipeline;

  dispatchWorkgroups(
    x: number,
    y?: number | undefined,
    z?: number | undefined,
  ): void;
}

export function INTERNAL_createComputePipeline(branch: TgpuRoot) {
  return new TgpuComputePipelineImpl(branch, {});
}

// --------------
// Implementation
// --------------

type TgpuComputePipelinePriors = {
  readonly bindGroupLayoutMap?: Map<TgpuBindGroupLayout, TgpuBindGroup>;
};

class TgpuComputePipelineImpl implements TgpuComputePipeline {
  private _label: string | undefined;

  constructor(
    private readonly _branch: TgpuRoot,
    private readonly _priors: TgpuComputePipelinePriors,
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
  ): TgpuComputePipeline {
    return new TgpuComputePipelineImpl(this._branch, {
      bindGroupLayoutMap: new Map([
        ...(this._priors.bindGroupLayoutMap ?? []),
        [bindGroupLayout, bindGroup],
      ]),
    });
  }

  dispatchWorkgroups(
    x: number,
    y?: number | undefined,
    z?: number | undefined,
  ): void {
    const pass = this._branch.commandEncoder.beginComputePass({
      label: this._label ?? '',
    });

    pass.dispatchWorkgroups(x, y, z);
  }
}

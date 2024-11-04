import type { TgpuNamable } from '../../namable';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';

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

export function INTERNAL_createComputePipeline(branch: ExperimentalTgpuRoot) {
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
  private _rawPipelineMemo: GPUComputePipeline | undefined;

  constructor(
    private readonly _branch: ExperimentalTgpuRoot,
    private readonly _priors: TgpuComputePipelinePriors,
  ) {}

  private get _rawPipeline(): GPUComputePipeline {
    if (this._rawPipelineMemo) {
      return this._rawPipelineMemo;
    }

    const device = this._branch.device;

    this._rawPipelineMemo = device.createComputePipeline({
      label: this._label ?? '<unnamed>',
      layout: device.createPipelineLayout({
        label: `${this._label ?? '<unnamed>'} - Pipeline Layout`,
        bindGroupLayouts: [],
      }),
      compute: {
        module: device.createShaderModule({
          label: `${this._label ?? '<unnamed>'} - Shader`,
          code: '', // TODO: Generate code
        }),
      },
    });

    return this._rawPipelineMemo;
  }

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

    pass.setPipeline(this._rawPipeline);
    // TODO: Implement setting bind groups
    // pass.setBindGroup

    pass.dispatchWorkgroups(x, y, z);
    pass.end();
  }
}

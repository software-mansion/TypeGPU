import type { TgpuNamable } from '../../namable';
import { ResolutionCtxImpl } from '../../resolutionCtx';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout';
import type { TgpuComputeFn } from '../function/tgpuComputeFn';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';

// ----------
// Public API
// ----------

export interface TgpuComputePipeline extends TgpuNamable {
  readonly resourceType: 'compute-pipeline';
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

export interface TgpuComputePipeline_INTERNAL {
  readonly rawPipeline: GPUComputePipeline;
}

export function INTERNAL_createComputePipeline(
  branch: ExperimentalTgpuRoot,
  entryFn: TgpuComputeFn,
) {
  return new TgpuComputePipelineImpl(branch, entryFn, {});
}

export function isComputePipeline(
  value: TgpuComputePipeline,
): value is TgpuComputePipeline {
  return (
    !!value &&
    (value as TgpuComputePipeline).resourceType === 'compute-pipeline'
  );
}

// --------------
// Implementation
// --------------

type TgpuComputePipelinePriors = {
  readonly bindGroupLayoutMap?: Map<TgpuBindGroupLayout, TgpuBindGroup>;
};

class TgpuComputePipelineImpl
  implements TgpuComputePipeline, TgpuComputePipeline_INTERNAL
{
  public readonly resourceType = 'compute-pipeline';

  private _label: string | undefined;
  private _rawPipelineMemo: GPUComputePipeline | undefined;

  constructor(
    private readonly _branch: ExperimentalTgpuRoot,
    private readonly _entryFn: TgpuComputeFn,
    private readonly _priors: TgpuComputePipelinePriors,
  ) {}

  public get rawPipeline(): GPUComputePipeline {
    if (this._rawPipelineMemo) {
      return this._rawPipelineMemo;
    }

    const device = this._branch.device;

    const ctx = new ResolutionCtxImpl({
      names: this._branch.nameRegistry,
      jitTranspiler: this._branch.jitTranspiler,
    });

    // Resolving code
    const code = ctx.resolve(this._entryFn);

    this._rawPipelineMemo = device.createComputePipeline({
      label: this._label ?? '<unnamed>',
      layout: device.createPipelineLayout({
        label: `${this._label ?? '<unnamed>'} - Pipeline Layout`,
        bindGroupLayouts: [],
      }),
      compute: {
        module: device.createShaderModule({
          label: `${this._label ?? '<unnamed>'} - Shader`,
          code,
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
    return new TgpuComputePipelineImpl(this._branch, this._entryFn, {
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

    pass.setPipeline(this.rawPipeline);
    // TODO: Implement setting bind groups
    // pass.setBindGroup

    pass.dispatchWorkgroups(x, y, z);
    pass.end();
  }
}

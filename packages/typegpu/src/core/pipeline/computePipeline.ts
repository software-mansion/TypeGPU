import { MissingBindGroupsError } from '../../errors.ts';
import type { TgpuNamable } from '../../namable.ts';
import { resolve } from '../../resolutionCtx.ts';
import { $internal } from '../../shared/symbols.ts';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout.ts';
import type { TgpuComputeFn } from '../function/tgpuComputeFn.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuSlot } from '../slot/slotTypes.ts';

// ----------
// Public API
// ----------

export interface TgpuComputePipelineInternals {
  readonly rawPipeline: GPUComputePipeline;
}

export interface TgpuComputePipeline extends TgpuNamable {
  readonly [$internal]: TgpuComputePipelineInternals;
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

export function INTERNAL_createComputePipeline(
  branch: ExperimentalTgpuRoot,
  slotBindings: [TgpuSlot<unknown>, unknown][],
  entryFn: TgpuComputeFn,
) {
  return new TgpuComputePipelineImpl(
    new ComputePipelineCore(branch, slotBindings, entryFn),
    {},
  );
}

export function isComputePipeline(
  value: unknown,
): value is TgpuComputePipeline {
  return (value as TgpuComputePipeline)?.resourceType === 'compute-pipeline';
}

// --------------
// Implementation
// --------------

type TgpuComputePipelinePriors = {
  readonly bindGroupLayoutMap?: Map<TgpuBindGroupLayout, TgpuBindGroup>;
};

type Memo = {
  pipeline: GPUComputePipeline;
  bindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | null;
};

class TgpuComputePipelineImpl implements TgpuComputePipeline {
  public readonly [$internal]: TgpuComputePipelineInternals;
  public readonly resourceType = 'compute-pipeline';

  constructor(
    private readonly _core: ComputePipelineCore,
    private readonly _priors: TgpuComputePipelinePriors,
  ) {
    this[$internal] = {
      get rawPipeline() {
        return _core.unwrap().pipeline;
      },
    };
  }

  get label(): string | undefined {
    return this._core.label;
  }

  get rawPipeline(): GPUComputePipeline {
    return this._core.unwrap().pipeline;
  }

  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuComputePipeline {
    return new TgpuComputePipelineImpl(this._core, {
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
    const memo = this._core.unwrap();
    const { branch, label } = this._core;

    const pass = branch.commandEncoder.beginComputePass({
      label: label ?? '<unnamed>',
    });

    pass.setPipeline(memo.pipeline);

    const missingBindGroups = new Set(memo.bindGroupLayouts);

    memo.bindGroupLayouts.forEach((layout, idx) => {
      if (memo.catchall && idx === memo.catchall[0]) {
        // Catch-all
        pass.setBindGroup(idx, branch.unwrap(memo.catchall[1]));
        missingBindGroups.delete(layout);
      } else {
        const bindGroup = this._priors.bindGroupLayoutMap?.get(layout);
        if (bindGroup !== undefined) {
          missingBindGroups.delete(layout);
          pass.setBindGroup(idx, branch.unwrap(bindGroup));
        }
      }
    });

    if (missingBindGroups.size > 0) {
      throw new MissingBindGroupsError(missingBindGroups);
    }

    pass.dispatchWorkgroups(x, y, z);
    pass.end();
  }

  $name(label?: string | undefined): this {
    this._core.label = label;
    return this;
  }
}

class ComputePipelineCore {
  public label: string | undefined;
  private _memo: Memo | undefined;

  constructor(
    public readonly branch: ExperimentalTgpuRoot,
    private readonly _slotBindings: [TgpuSlot<unknown>, unknown][],
    private readonly _entryFn: TgpuComputeFn,
  ) {}

  public unwrap(): Memo {
    if (this._memo === undefined) {
      const device = this.branch.device;

      // Resolving code
      const { code, bindGroupLayouts, catchall } = resolve(
        {
          '~resolve': (ctx) => {
            ctx.withSlots(this._slotBindings, () => {
              ctx.resolve(this._entryFn);
            });
            return '';
          },

          toString: () => `computePipeline:${this.label ?? '<unnamed>'}`,
        },
        {
          names: this.branch.nameRegistry,
          jitTranspiler: this.branch.jitTranspiler,
        },
      );

      if (catchall !== null) {
        bindGroupLayouts[catchall[0]]?.$name(
          `${this.label ?? '<unnamed>'} - Automatic Bind Group & Layout`,
        );
      }

      this._memo = {
        pipeline: device.createComputePipeline({
          label: this.label ?? '<unnamed>',
          layout: device.createPipelineLayout({
            label: `${this.label ?? '<unnamed>'} - Pipeline Layout`,
            bindGroupLayouts: bindGroupLayouts.map((l) =>
              this.branch.unwrap(l),
            ),
          }),
          compute: {
            module: device.createShaderModule({
              label: `${this.label ?? '<unnamed>'} - Shader`,
              code,
            }),
          },
        }),
        bindGroupLayouts,
        catchall,
      };
    }

    return this._memo;
  }
}

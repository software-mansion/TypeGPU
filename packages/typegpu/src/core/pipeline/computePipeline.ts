import { MissingBindGroupsError } from '../../errors.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import { resolve } from '../../resolutionCtx.ts';
import { $getNameForward, $internal } from '../../shared/symbols.ts';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout.ts';
import type { TgpuComputeFn } from '../function/tgpuComputeFn.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuSlot } from '../slot/slotTypes.ts';
import type { TgpuQuerySet } from '../../core/querySet/querySet.ts';
import {
  createWithPerformanceCallback,
  createWithTimestampWrites,
  setupTimestampWrites,
  type Timeable,
  type TimestampWritesPriors,
  triggerPerformanceCallback,
} from './timeable.ts';

interface ComputePipelineInternals {
  readonly rawPipeline: GPUComputePipeline;
  readonly priors: TgpuComputePipelinePriors & TimestampWritesPriors;
}

// ----------
// Public API
// ----------

export interface TgpuComputePipeline
  extends TgpuNamable, Timeable<TgpuComputePipeline> {
  readonly [$internal]: ComputePipelineInternals;
  readonly resourceType: 'compute-pipeline';

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
  const maybe = value as TgpuComputePipeline | undefined;
  return maybe?.resourceType === 'compute-pipeline' && !!maybe[$internal];
}

// --------------
// Implementation
// --------------

type TgpuComputePipelinePriors = {
  readonly bindGroupLayoutMap?: Map<TgpuBindGroupLayout, TgpuBindGroup>;
} & TimestampWritesPriors;

type Memo = {
  pipeline: GPUComputePipeline;
  usedBindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | undefined;
};

class TgpuComputePipelineImpl implements TgpuComputePipeline {
  public readonly [$internal]: ComputePipelineInternals;
  public readonly resourceType = 'compute-pipeline';
  readonly [$getNameForward]: ComputePipelineCore;

  constructor(
    private readonly _core: ComputePipelineCore,
    private readonly _priors: TgpuComputePipelinePriors,
  ) {
    this[$internal] = {
      get rawPipeline() {
        return _core.unwrap().pipeline;
      },
      get priors() {
        return _priors;
      },
    };
    this[$getNameForward] = _core;
  }

  get rawPipeline(): GPUComputePipeline {
    return this._core.unwrap().pipeline;
  }

  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuComputePipeline {
    return new TgpuComputePipelineImpl(this._core, {
      ...this._priors,
      bindGroupLayoutMap: new Map([
        ...(this._priors.bindGroupLayoutMap ?? []),
        [bindGroupLayout, bindGroup],
      ]),
    });
  }

  withPerformanceCallback(
    callback: (start: bigint, end: bigint) => void | Promise<void>,
  ): TgpuComputePipeline {
    const newPriors = createWithPerformanceCallback(
      this._priors,
      callback,
      this._core.branch,
    );
    return new TgpuComputePipelineImpl(this._core, newPriors);
  }

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): TgpuComputePipeline {
    const newPriors = createWithTimestampWrites(
      this._priors,
      options,
      this._core.branch,
    );
    return new TgpuComputePipelineImpl(this._core, newPriors);
  }

  dispatchWorkgroups(
    x: number,
    y?: number | undefined,
    z?: number | undefined,
  ): void {
    const memo = this._core.unwrap();
    const { branch } = this._core;

    const passDescriptor: GPUComputePassDescriptor = {
      label: getName(this._core) ?? '<unnamed>',
      ...setupTimestampWrites(this._priors, branch),
    };

    const pass = branch.commandEncoder.beginComputePass(passDescriptor);

    pass.setPipeline(memo.pipeline);

    const missingBindGroups = new Set(memo.usedBindGroupLayouts);

    memo.usedBindGroupLayouts.forEach((layout, idx) => {
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

    if (this._priors.performanceCallback) {
      triggerPerformanceCallback({
        root: branch,
        priors: this._priors,
      });
    }
  }

  $name(label: string): this {
    setName(this._core, label);
    return this;
  }
}

class ComputePipelineCore {
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
      const { code, usedBindGroupLayouts, catchall } = resolve(
        {
          '~resolve': (ctx) => {
            ctx.withSlots(this._slotBindings, () => {
              ctx.resolve(this._entryFn);
            });
            return '';
          },

          toString: () => `computePipeline:${getName(this) ?? '<unnamed>'}`,
        },
        {
          names: this.branch.nameRegistry,
        },
      );

      if (catchall !== undefined) {
        usedBindGroupLayouts[catchall[0]]?.$name(
          `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
        );
      }

      this._memo = {
        pipeline: device.createComputePipeline({
          label: getName(this) ?? '<unnamed>',
          layout: device.createPipelineLayout({
            label: `${getName(this) ?? '<unnamed>'} - Pipeline Layout`,
            bindGroupLayouts: usedBindGroupLayouts.map((l) =>
              this.branch.unwrap(l)
            ),
          }),
          compute: {
            module: device.createShaderModule({
              label: `${getName(this) ?? '<unnamed>'} - Shader`,
              code,
            }),
          },
        }),
        usedBindGroupLayouts,
        catchall,
      };
    }

    return this._memo;
  }
}

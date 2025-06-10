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
import { isQuerySet, type TgpuQuerySet } from '../../core/querySet/querySet.ts';

interface ComputePipelineInternals {
  readonly rawPipeline: GPUComputePipeline;
}

// ----------
// Public API
// ----------

export interface TgpuComputePipeline extends TgpuNamable {
  readonly [$internal]: ComputePipelineInternals;
  readonly resourceType: 'compute-pipeline';

  with(
    bindGroupLayout: TgpuBindGroupLayout,
    bindGroup: TgpuBindGroup,
  ): TgpuComputePipeline;

  withPerformanceListener(
    listener: (start: bigint, end: bigint) => void | Promise<void>,
  ): TgpuComputePipeline;

  withTimeStampWrites(
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet,
    beginningOfPassWriteIndex?: number,
    endOfPassWriteIndex?: number,
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
  readonly timestampWrites?: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  };
  readonly performanceListener?: (
    start: bigint,
    end: bigint,
  ) => void | Promise<void>;
};

type Memo = {
  pipeline: GPUComputePipeline;
  bindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | null;
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

  withPerformanceListener(
    listener: (start: bigint, end: bigint) => void | Promise<void>,
  ): TgpuComputePipeline {
    if (!this._core.branch.enabledFeatures.has('timestamp-query')) {
      throw new Error(
        'Performance listener requires the "timestamp-query" feature to be enabled on GPU device.',
      );
    }

    if (!this._priors.timestampWrites) {
      return new TgpuComputePipelineImpl(this._core, {
        ...this._priors,
        performanceListener: listener,
        timestampWrites: {
          querySet: this._core.branch.createQuerySet(
            'timestamp',
            2,
          ),
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      });
    }

    return new TgpuComputePipelineImpl(this._core, {
      ...this._priors,
      performanceListener: listener,
    });
  }

  withTimeStampWrites(
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet,
    beginningOfPassWriteIndex?: number,
    endOfPassWriteIndex?: number,
  ): TgpuComputePipeline {
    if (!this._core.branch.enabledFeatures.has('timestamp-query')) {
      throw new Error(
        'Timestamp writes require the "timestamp-query" feature to be enabled on GPU device.',
      );
    }

    const timestampWrites: TgpuComputePipelinePriors['timestampWrites'] = {
      querySet,
    };

    if (beginningOfPassWriteIndex !== undefined) {
      timestampWrites.beginningOfPassWriteIndex = beginningOfPassWriteIndex;
    }
    if (endOfPassWriteIndex !== undefined) {
      timestampWrites.endOfPassWriteIndex = endOfPassWriteIndex;
    }

    return new TgpuComputePipelineImpl(this._core, {
      ...this._priors,
      timestampWrites,
    });
  }

  dispatchWorkgroups(
    x: number,
    y?: number | undefined,
    z?: number | undefined,
  ): void {
    const memo = this._core.unwrap();
    const { branch } = this._core;

    const label = getName(this._core) ?? '<unnamed>';
    const passDescriptor: GPUComputePassDescriptor = { label };

    if (this._priors.timestampWrites) {
      const {
        querySet,
        beginningOfPassWriteIndex,
        endOfPassWriteIndex,
      } = this._priors.timestampWrites;

      passDescriptor.timestampWrites = {
        querySet: isQuerySet(querySet) ? branch.unwrap(querySet) : querySet,
      };
      if (beginningOfPassWriteIndex !== undefined) {
        passDescriptor.timestampWrites.beginningOfPassWriteIndex =
          beginningOfPassWriteIndex;
      }
      if (endOfPassWriteIndex !== undefined) {
        passDescriptor.timestampWrites.endOfPassWriteIndex =
          endOfPassWriteIndex;
      }
    }

    const pass = branch.commandEncoder.beginComputePass(passDescriptor);

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

    const listener = this._priors.performanceListener;
    if (listener) {
      const querySet = this._priors.timestampWrites?.querySet;
      if (!querySet) {
        throw new Error(
          'Cannot dispatch workgroups with performance listener without a query set.',
        );
      }

      if (!isQuerySet(querySet)) {
        throw new Error(
          'Performance listener with raw GPUQuerySet is not supported. Use TgpuQuerySet instead.',
        );
      }

      if (querySet[$internal].resolveBuffer === null) {
        querySet[$internal].resolveBuffer = branch.device.createBuffer({
          size: 2 * BigUint64Array.BYTES_PER_ELEMENT,
          usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE,
        });
      }

      branch.commandEncoder.resolveQuerySet(
        branch.unwrap(querySet),
        0,
        2,
        querySet[$internal].resolveBuffer,
        0,
      );

      this._core.branch.flush();
      branch.device.queue.onSubmittedWorkDone().then(async () => {
        if (!querySet.available) {
          return;
        }
        const result = await querySet.read();
        const start = result[0];
        const end = result[1];

        if (start === undefined || end === undefined) {
          throw new Error('QuerySet did not return valid timestamps.');
        }

        await listener(start, end);
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
      const { code, bindGroupLayouts, catchall } = resolve(
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
          jitTranspiler: this.branch.jitTranspiler,
        },
      );

      if (catchall !== null) {
        bindGroupLayouts[catchall[0]]?.$name(
          `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
        );
      }

      this._memo = {
        pipeline: device.createComputePipeline({
          label: getName(this) ?? '<unnamed>',
          layout: device.createPipelineLayout({
            label: `${getName(this) ?? '<unnamed>'} - Pipeline Layout`,
            bindGroupLayouts: bindGroupLayouts.map((l) =>
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
        bindGroupLayouts,
        catchall,
      };
    }

    return this._memo;
  }
}

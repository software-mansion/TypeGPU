import type { AnyComputeBuiltin } from '../../builtin.ts';
import type { TgpuQuerySet } from '../../core/querySet/querySet.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { Void } from '../../data/wgslTypes.ts';
import { MissingBindGroupsError } from '../../errors.ts';
import { type ResolutionResult, resolve } from '../../resolutionCtx.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, PERF, setName } from '../../shared/meta.ts';
import { $getNameForward, $internal, $resolve } from '../../shared/symbols.ts';
import {
  isBindGroup,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import { logDataFromGPU } from '../../tgsl/consoleLog/deserializers.ts';
import type { LogResources } from '../../tgsl/consoleLog/types.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import {
  wgslExtensions,
  wgslExtensionToFeatureName,
} from '../../wgslExtensions.ts';
import type { IORecord } from '../function/fnTypes.ts';
import type { TgpuComputeFn } from '../function/tgpuComputeFn.ts';
import { namespace } from '../resolve/namespace.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuSlot } from '../slot/slotTypes.ts';
import { warnIfOverflow } from './limitsOverflow.ts';
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
  readonly root: ExperimentalTgpuRoot;
}

// ----------
// Public API
// ----------

export interface TgpuComputePipeline
  extends TgpuNamable, SelfResolvable, Timeable {
  readonly [$internal]: ComputePipelineInternals;
  readonly resourceType: 'compute-pipeline';

  /**
   * @deprecated This overload is outdated.
   * Call `pipeline.with(bindGroup)` instead.
   */
  with<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries>,
  ): this;
  with(bindGroup: TgpuBindGroup): this;

  dispatchWorkgroups(
    x: number,
    y?: number,
    z?: number,
  ): void;
}

export declare namespace TgpuComputePipeline {
  export type Descriptor<
    Input extends IORecord<AnyComputeBuiltin> = IORecord<AnyComputeBuiltin>,
  > = {
    compute: TgpuComputeFn<Input>;
  };
}

export function INTERNAL_createComputePipeline(
  branch: ExperimentalTgpuRoot,
  slotBindings: [TgpuSlot<unknown>, unknown][],
  descriptor: TgpuComputePipeline.Descriptor,
) {
  return new TgpuComputePipelineImpl(
    new ComputePipelineCore(branch, slotBindings, descriptor),
    {},
  );
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
  logResources: LogResources | undefined;
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
      get root() {
        return _core.root;
      },
    };
    this[$getNameForward] = _core;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return ctx.resolve(this._core);
  }

  toString(): string {
    return `computePipeline:${getName(this) ?? '<unnamed>'}`;
  }

  get rawPipeline(): GPUComputePipeline {
    return this._core.unwrap().pipeline;
  }

  with<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries>,
  ): this;
  with(bindGroup: TgpuBindGroup): this;
  with(
    layoutOrBindGroup: TgpuBindGroupLayout | TgpuBindGroup,
    bindGroup?: TgpuBindGroup,
  ): this {
    if (isBindGroup(layoutOrBindGroup)) {
      return new TgpuComputePipelineImpl(this._core, {
        ...this._priors,
        bindGroupLayoutMap: new Map([
          ...(this._priors.bindGroupLayoutMap ?? []),
          [layoutOrBindGroup.layout, layoutOrBindGroup],
        ]),
      }) as this;
    }

    return new TgpuComputePipelineImpl(this._core, {
      ...this._priors,
      bindGroupLayoutMap: new Map([
        ...(this._priors.bindGroupLayoutMap ?? []),
        [layoutOrBindGroup, bindGroup as TgpuBindGroup],
      ]),
    }) as this;
  }

  withPerformanceCallback(
    callback: (start: bigint, end: bigint) => void | Promise<void>,
  ): this {
    const newPriors = createWithPerformanceCallback(
      this._priors,
      callback,
      this._core.root,
    );
    return new TgpuComputePipelineImpl(this._core, newPriors) as this;
  }

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): this {
    const newPriors = createWithTimestampWrites(
      this._priors,
      options,
      this._core.root,
    );
    return new TgpuComputePipelineImpl(this._core, newPriors) as this;
  }

  dispatchWorkgroups(
    x: number,
    y?: number,
    z?: number,
  ): void {
    const memo = this._core.unwrap();
    const { root } = this._core;

    const passDescriptor: GPUComputePassDescriptor = {
      label: getName(this._core) ?? '<unnamed>',
      ...setupTimestampWrites(this._priors, root),
    };

    const commandEncoder = root.device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass(passDescriptor);

    pass.setPipeline(memo.pipeline);

    const missingBindGroups = new Set(memo.usedBindGroupLayouts);

    warnIfOverflow(
      memo.usedBindGroupLayouts,
      this[$internal].root.device.limits,
    );

    memo.usedBindGroupLayouts.forEach((layout, idx) => {
      if (memo.catchall && idx === memo.catchall[0]) {
        // Catch-all
        pass.setBindGroup(idx, root.unwrap(memo.catchall[1]));
        missingBindGroups.delete(layout);
      } else {
        const bindGroup = this._priors.bindGroupLayoutMap?.get(layout);
        if (bindGroup !== undefined) {
          missingBindGroups.delete(layout);
          pass.setBindGroup(idx, root.unwrap(bindGroup));
        }
      }
    });

    if (missingBindGroups.size > 0) {
      throw new MissingBindGroupsError(missingBindGroups);
    }

    pass.dispatchWorkgroups(x, y, z);
    pass.end();
    root.device.queue.submit([commandEncoder.finish()]);

    if (memo.logResources) {
      logDataFromGPU(memo.logResources);
    }

    if (this._priors.performanceCallback) {
      void triggerPerformanceCallback({
        root,
        priors: this._priors,
      });
    }
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }
}

class ComputePipelineCore implements SelfResolvable {
  readonly [$internal] = true;
  private _memo: Memo | undefined;

  #slotBindings: [TgpuSlot<unknown>, unknown][];
  #descriptor: TgpuComputePipeline.Descriptor;

  constructor(
    public readonly root: ExperimentalTgpuRoot,
    slotBindings: [TgpuSlot<unknown>, unknown][],
    descriptor: TgpuComputePipeline.Descriptor,
  ) {
    this.#slotBindings = slotBindings;
    this.#descriptor = descriptor;
  }

  [$resolve](ctx: ResolutionCtx) {
    return ctx.withSlots(this.#slotBindings, () => {
      ctx.resolve(this.#descriptor.compute);
      return snip('', Void, /* origin */ 'runtime');
    });
  }

  toString() {
    return 'computePipelineCore';
  }

  public unwrap(): Memo {
    if (this._memo === undefined) {
      const device = this.root.device;
      const enableExtensions = wgslExtensions.filter((extension) =>
        this.root.enabledFeatures.has(wgslExtensionToFeatureName[extension])
      );

      // Resolving code
      let resolutionResult: ResolutionResult;

      let resolveMeasure: PerformanceMeasure | undefined;
      const ns = namespace({ names: this.root.nameRegistrySetting });
      if (PERF?.enabled) {
        const resolveStart = performance.mark('typegpu:resolution:start');
        resolutionResult = resolve(this, {
          namespace: ns,
          enableExtensions,
          shaderGenerator: this.root.shaderGenerator,
          root: this.root,
        });
        resolveMeasure = performance.measure('typegpu:resolution', {
          start: resolveStart.name,
        });
      } else {
        resolutionResult = resolve(this, {
          namespace: ns,
          enableExtensions,
          shaderGenerator: this.root.shaderGenerator,
          root: this.root,
        });
      }

      const { code, usedBindGroupLayouts, catchall, logResources } =
        resolutionResult;

      if (catchall !== undefined) {
        usedBindGroupLayouts[catchall[0]]?.$name(
          `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
        );
      }

      const module = device.createShaderModule({
        label: `${getName(this) ?? '<unnamed>'} - Shader`,
        code,
      });

      this._memo = {
        pipeline: device.createComputePipeline({
          label: getName(this) ?? '<unnamed>',
          layout: device.createPipelineLayout({
            label: `${getName(this) ?? '<unnamed>'} - Pipeline Layout`,
            bindGroupLayouts: usedBindGroupLayouts.map((l) =>
              this.root.unwrap(l)
            ),
          }),
          compute: { module },
        }),
        usedBindGroupLayouts,
        catchall,
        logResources,
      };

      if (PERF?.enabled) {
        void (async () => {
          const start = performance.mark('typegpu:compile-start');
          await device.queue.onSubmittedWorkDone();
          const compileMeasure = performance.measure('typegpu:compiled', {
            start: start.name,
          });

          PERF?.record('resolution', {
            resolveDuration: resolveMeasure?.duration,
            compileDuration: compileMeasure.duration,
            wgslSize: code.length,
          });
        })();
      }
    }

    return this._memo;
  }
}

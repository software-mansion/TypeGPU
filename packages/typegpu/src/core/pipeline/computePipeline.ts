import type { AnyComputeBuiltin } from '../../builtin.ts';
import type { TgpuQuerySet } from '../querySet/querySet.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { Void } from '../../data/wgslTypes.ts';
import { resolve } from '../../resolutionCtx.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, PERF, setName } from '../../shared/meta.ts';

import type { TgpuDeviceOwningSoul } from '../../shared/soul.ts';
import { $getNameForward, $internal, $resolve, $soul } from '../../shared/symbols.ts';
import {
  isBindGroup,
  isBindGroupLayout,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import {
  INTERNAL_adoptCommandEncoder,
  INTERNAL_createCommandEncoder,
  type TgpuCommandEncoder,
} from '../commandEncoder/commandEncoder.ts';
import { INTERNAL_adoptComputePass, type TgpuComputePass } from '../commandEncoder/computePass.ts';
import { emitComputeDispatch, finalizeOwnEncoder } from './drawState.ts';
import {
  isGPUCommandEncoder,
  isGPUComputePassEncoder,
  isTgpuCommandEncoder,
  isTgpuComputePass,
} from './typeGuards.ts';
import type { LogResources } from '../../tgsl/consoleLog/types.ts';
import { isGPUBuffer, type ResolutionCtx, type SelfResolvable } from '../../types.ts';
import { wgslEnableExtensions, wgslEnableExtensionToFeatureName } from '../../wgslExtensions.ts';
import type { IORecord } from '../function/fnTypes.ts';
import type { TgpuComputeFn } from '../function/tgpuComputeFn.ts';
import { namespace } from '../resolve/namespace.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuSlot } from '../slot/slotTypes.ts';

import type { PrimitiveOffsetInfo } from '../../data/offsetUtils.ts';
import { warnIfOverflow } from './webgpuLimitations.ts';
import {
  collectBindGroupPairs,
  DISPATCH_INDIRECT_SIZE,
  resolveIndirectOffset,
  restoreTimestampPriors,
} from './pipelineUtils.ts';
import type { RestoreContext } from '../../serial/types.ts';
import { invariant } from '../../errors.ts';
import {
  createWithPerformanceCallback,
  createWithTimestampWrites,
  type Timeable,
  type TimestampWritesPriors,
} from './timeable.ts';
import { nonTransferablePriorsOf } from './priors.ts';
import type { IndirectFlag, TgpuBuffer } from '../buffer/buffer.ts';
import {
  NullPerformanceTracker,
  PerformanceTrackerImpl,
  type PerformanceTracker,
} from './performanceTracker.ts';
import { logger } from '../../tgpuLogger.ts';

export interface ComputePipelineInternals {
  readonly core: ComputePipelineCore;
  readonly priors: TgpuComputePipelinePriors & TimestampWritesPriors;
  readonly root: ExperimentalTgpuRoot;
  readonly materialize: () => GPUComputePipeline;
}

export interface TgpuComputePipelineSoul extends TgpuDeviceOwningSoul<
  'compute-pipeline',
  GPUComputePipeline
> {
  usedBindGroupLayouts?: TgpuBindGroupLayout[] | undefined;
  bindGroups?: [TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup][] | undefined;
  timestampWrites?: TimestampWritesPriors['timestampWrites'];
  performanceCallback?: TimestampWritesPriors['performanceCallback'];
  nonTransferablePriors?: string[] | undefined;
}

// ----------
// Public API
// ----------

export interface TgpuComputePipeline extends TgpuNamable, SelfResolvable, Timeable {
  readonly [$internal]: ComputePipelineInternals;
  readonly [$soul]: TgpuComputePipelineSoul;
  readonly resourceType: 'compute-pipeline';

  /**
   * @deprecated This overload is outdated.
   * Call `pipeline.with(bindGroup)` instead.
   */
  with<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries>,
  ): this;
  with(bindGroupLayout: TgpuBindGroupLayout, bindGroup: GPUBindGroup): this;
  with(bindGroup: TgpuBindGroup): this;
  /**
   * Directs subsequent dispatches into the given compute pass, letting multiple
   * pipelines share one pass (and one submission).
   */
  with(pass: TgpuComputePass): this;
  /**
   * Directs subsequent dispatches into the given command encoder. Each dispatch
   * records its own compute pass; the caller owns the submission.
   */
  with(encoder: TgpuCommandEncoder): this;
  with(encoder: GPUCommandEncoder): this;
  with(pass: GPUComputePassEncoder): this;
  /**
   * Applies a transform to this pipeline, letting packages hand out reusable
   * configuration steps, e.g. `pipeline.pipe(cache.inject())`.
   */
  pipe<T>(transform: (pipeline: this) => T): T;

  dispatchWorkgroups(x: number, y?: number, z?: number): void;

  /**
   * Immediately resolves the pipeline, then awaits `device.createComputePipelineAsync()`.
   * NOTE: it is not necessary to initialize pipelines manually.
   */
  initAsync(): Promise<void>;

  /**
   * Immediately resolves the pipeline and creates WebGPU resources.
   * NOTE: it is not necessary to initialize pipelines manually.
   */
  initSync(): void;

  /**
   * Dispatches compute workgroups using parameters read from a buffer.
   * The buffer must contain 3 consecutive u32 values (x, y, z workgroup counts).
   * To get the correct offset within complex data structures, use `d.memoryLayoutOf(...)`.
   *
   * @param indirectBuffer - Buffer marked with 'indirect' usage containing dispatch parameters or raw GPUBuffer
   * @param start - PrimitiveOffsetInfo pointing to the first dispatch parameter. If not provided, starts at offset 0. To obtain safe offsets, use `d.memoryLayoutOf(...)`.
   */
  dispatchWorkgroupsIndirect<T extends AnyWgslData>(
    indirectBuffer: (TgpuBuffer<T> & IndirectFlag) | GPUBuffer,
    start?: PrimitiveOffsetInfo | number,
  ): void;
}

export declare namespace TgpuComputePipeline {
  export type Descriptor<Input extends IORecord<AnyComputeBuiltin> = IORecord<AnyComputeBuiltin>> =
    {
      compute: TgpuComputeFn<Input>;
    };
}

export function INTERNAL_createComputePipeline(
  root: ExperimentalTgpuRoot,
  slotBindings: [TgpuSlot<unknown>, unknown][],
  descriptor: TgpuComputePipeline.Descriptor,
) {
  return new TgpuComputePipelineImpl(new ComputePipelineCore(root, slotBindings, descriptor), {});
}

export function INTERNAL_restoreComputePipeline(
  soul: TgpuComputePipelineSoul,
  ctx: RestoreContext,
): TgpuComputePipeline {
  invariant(soul.raw, 'A compute pipeline soul is only complete once materialized.');
  const root = ctx.getRoot(soul.device) as ExperimentalTgpuRoot;
  const core = ComputePipelineCore.precompiled(root, {
    pipeline: soul.raw,
    usedBindGroupLayouts: soul.usedBindGroupLayouts ?? [],
    // The catchall group is already one of `bindGroups`, keyed by the layout it was resolved with
    catchall: undefined,
    logResources: undefined,
  });
  const pipeline: TgpuComputePipeline = new TgpuComputePipelineImpl(core, {
    bindGroupLayoutMap: new Map(soul.bindGroups),
  });
  return restoreTimestampPriors(pipeline, soul);
}

// --------------
// Implementation
// --------------

type TgpuComputePipelinePriors = {
  readonly bindGroupLayoutMap?: Map<TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup>;
  /** A pass the pipeline dispatches into, but does not own */
  readonly pass?: TgpuComputePass | undefined;
  /** An encoder the pipeline records its own passes into, but does not submit */
  readonly encoder?: TgpuCommandEncoder | undefined;
} & TimestampWritesPriors;

type Memo = {
  pipeline: GPUComputePipeline;
  usedBindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | undefined;
  logResources: LogResources | undefined;
};

class TgpuComputePipelineImpl implements TgpuComputePipeline {
  public readonly [$internal]: ComputePipelineInternals;
  public readonly [$soul]: TgpuComputePipelineSoul;
  public readonly resourceType = 'compute-pipeline';
  readonly [$getNameForward]: ComputePipelineCore;

  constructor(core: ComputePipelineCore, priors: TgpuComputePipelinePriors) {
    this[$soul] = {
      type: 'compute-pipeline',
      device: core.root.device,
      raw: undefined,
      label: undefined,
    };
    this[$internal] = {
      core,
      priors,
      root: core.root,
      materialize: () => {
        const soul = this[$soul];
        if (!soul.raw) {
          const memo = core.unwrap();
          soul.raw = memo.pipeline;
          soul.usedBindGroupLayouts = memo.usedBindGroupLayouts;
          soul.bindGroups = collectBindGroupPairs(
            memo.usedBindGroupLayouts,
            memo.catchall,
            priors.bindGroupLayoutMap,
          );
          soul.timestampWrites = priors.timestampWrites;
          soul.performanceCallback = priors.performanceCallback;
          soul.nonTransferablePriors = nonTransferablePriorsOf(priors);
        }
        return soul.raw;
      },
    };
    this[$getNameForward] = core;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return ctx.resolve(this[$internal].core);
  }

  toString(): string {
    return `computePipeline:${getName(this) ?? '<unnamed>'}`;
  }

  #withPriors(patch: Partial<TgpuComputePipelinePriors>): this {
    const { core, priors } = this[$internal];

    return new TgpuComputePipelineImpl(core, { ...priors, ...patch }) as this;
  }

  with<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries>,
  ): this;
  with(bindGroupLayout: TgpuBindGroupLayout, bindGroup: GPUBindGroup): this;
  with(bindGroup: TgpuBindGroup): this;
  with(pass: TgpuComputePass): this;
  with(encoder: TgpuCommandEncoder): this;
  with(encoder: GPUCommandEncoder): this;
  with(pass: GPUComputePassEncoder): this;
  with(
    first:
      | TgpuBindGroupLayout
      | TgpuBindGroup
      | TgpuComputePass
      | TgpuCommandEncoder
      | GPUCommandEncoder
      | GPUComputePassEncoder,
    bindGroup?: TgpuBindGroup | GPUBindGroup,
  ): this {
    const internals = this[$internal];

    if (isTgpuComputePass(first)) {
      return this.#withPriors({ pass: first, encoder: undefined });
    }

    if (isTgpuCommandEncoder(first)) {
      return this.#withPriors({ pass: undefined, encoder: first });
    }

    if (isGPUComputePassEncoder(first)) {
      return this.#withPriors({
        pass: INTERNAL_adoptComputePass(internals.root, first),
        encoder: undefined,
      });
    }

    if (isGPUCommandEncoder(first)) {
      return this.#withPriors({
        pass: undefined,
        encoder: INTERNAL_adoptCommandEncoder(internals.root, first),
      });
    }

    if (isBindGroup(first) || isBindGroupLayout(first)) {
      const [layout, group] = isBindGroup(first)
        ? [first.layout, first]
        : [first, bindGroup as TgpuBindGroup | GPUBindGroup];

      return this.#withPriors({
        bindGroupLayoutMap: new Map([
          ...(internals.priors.bindGroupLayoutMap ?? []),
          [layout, group],
        ]),
      });
    }

    throw new Error('Unsupported value passed into .with()');
  }

  pipe<T>(transform: (pipeline: this) => T): T {
    return transform(this);
  }

  withPerformanceCallback(callback: (start: bigint, end: bigint) => void | Promise<void>): this {
    const internals = this[$internal];

    if (internals.priors.timestampWrites) {
      return this.#withPriors({ performanceCallback: callback });
    }

    const querySet = internals.core.performanceCallbackQuerySet;
    if (!querySet) {
      logger.warn(
        'webgpu-feature-missing',
        'Performance callback cannot be used because the timestamp-query feature is not enabled on the root.',
      );
      return this;
    }
    return this.#withPriors(createWithPerformanceCallback(internals.priors, callback, querySet));
  }

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): this {
    const internals = this[$internal];

    return this.#withPriors(createWithTimestampWrites(internals.priors, options, internals.root));
  }

  dispatchWorkgroups(x: number, y?: number, z?: number): void {
    this.#execute((pass) => pass.dispatchWorkgroups(x, y, z));
  }

  dispatchWorkgroupsIndirect<T extends AnyWgslData>(
    indirectBuffer: (TgpuBuffer<T> & IndirectFlag) | GPUBuffer,
    start?: PrimitiveOffsetInfo | number,
  ): void {
    const rawBuffer = isGPUBuffer(indirectBuffer) ? indirectBuffer : indirectBuffer.buffer;
    const offset = resolveIndirectOffset(
      indirectBuffer,
      start,
      DISPATCH_INDIRECT_SIZE,
      'dispatchWorkgroupsIndirect',
    );

    this.#execute((pass) => pass.dispatchWorkgroupsIndirect(rawBuffer, offset));
  }

  initAsync(): Promise<void> {
    return this[$internal].core.initAsync();
  }

  initSync() {
    this[$internal].core.initSync();
  }

  #execute(dispatch: (pass: GPUComputePassEncoder) => void): void {
    const { core, priors, root } = this[$internal];

    if (priors.pass) {
      emitComputeDispatch(root, priors.pass[$internal], this, dispatch);
      return;
    }

    const encoder = priors.encoder ?? INTERNAL_createCommandEncoder(root);
    const pass = encoder.beginComputePass({
      label: getName(core) ?? '<unnamed>',
      timestampWrites: priors.timestampWrites,
    });
    emitComputeDispatch(root, pass[$internal], this, dispatch, /* ownsPass */ true);
    pass.end();

    finalizeOwnEncoder(encoder, core, core.unwrap().logResources, priors);
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }
}

class ComputePipelineCore implements SelfResolvable {
  readonly [$internal] = true;
  readonly root: ExperimentalTgpuRoot;
  #performanceTracker: PerformanceTracker;

  #initAsyncPromise: Promise<void> | undefined;
  #memo: Memo | undefined;

  #slotBindings: [TgpuSlot<unknown>, unknown][];
  #descriptor: TgpuComputePipeline.Descriptor | undefined;
  #performanceCallbackQuerySet: TgpuQuerySet<'timestamp'> | undefined;

  constructor(
    root: ExperimentalTgpuRoot,
    slotBindings: [TgpuSlot<unknown>, unknown][],
    descriptor: TgpuComputePipeline.Descriptor | undefined,
  ) {
    this.root = root;
    this.#slotBindings = slotBindings;
    this.#descriptor = descriptor;
    this.#performanceTracker = PERF?.enabled
      ? new PerformanceTrackerImpl()
      : new NullPerformanceTracker();
  }

  static precompiled(root: ExperimentalTgpuRoot, memo: Memo): ComputePipelineCore {
    const core = new ComputePipelineCore(root, [], undefined);
    core.#memo = memo;
    return core;
  }

  [$resolve](ctx: ResolutionCtx) {
    const descriptor = this.#descriptor;
    if (!descriptor) {
      // Precompiled pipelines have nothing to contribute to the shader
      return snip('', Void, /* origin */ 'runtime');
    }
    return ctx.withSlots(this.#slotBindings, () => {
      ctx.resolve(descriptor.compute);
      return snip('', Void, /* origin */ 'runtime');
    });
  }

  toString() {
    return 'computePipelineCore';
  }

  get performanceCallbackQuerySet() {
    if (!this.root.enabledFeatures.has('timestamp-query')) {
      return undefined;
    }
    return (this.#performanceCallbackQuerySet ??= this.root.createQuerySet('timestamp', 2));
  }

  /**
   * @privateRemarks
   * This function cannot be a regular async function
   * because when called multiple times before the promise finishes,
   * we want it to return the same promise each time.
   */
  initAsync(): Promise<void> {
    if (this.#memo !== undefined) {
      // the pipeline was already resolved & compiled
      return Promise.resolve();
    }

    if (this.#initAsyncPromise === undefined) {
      // the pipeline did not start resolution & compilation
      const device = this.root.device;
      const { resolutionResult, module } = this.resolveAndCreateShaderModule();
      const { usedBindGroupLayouts, catchall, logResources } = resolutionResult;

      this.#initAsyncPromise = device
        .createComputePipelineAsync({
          label: getName(this) ?? '<unnamed>',
          layout: device.createPipelineLayout({
            label: `${getName(this) ?? '<unnamed>'} - Pipeline Layout`,
            bindGroupLayouts: usedBindGroupLayouts.map((l) => this.root.unwrap(l)),
          }),
          compute: { module },
        })
        .then((pipeline) => {
          this.#memo = { pipeline, usedBindGroupLayouts, catchall, logResources };
          this.#performanceTracker.measureCompile(device);
        })
        .finally(() => {
          this.#initAsyncPromise = undefined;
        });
    }
    return this.#initAsyncPromise;
  }

  initSync() {
    if (this.#memo !== undefined) {
      return;
    }

    if (this.#initAsyncPromise !== undefined) {
      throw new Error("'pipeline.initAsync()' was called and is not yet resolved.");
    }

    const device = this.root.device;
    const { resolutionResult, module } = this.resolveAndCreateShaderModule();
    const { usedBindGroupLayouts, catchall, logResources } = resolutionResult;

    this.#memo = {
      pipeline: device.createComputePipeline({
        label: getName(this) ?? '<unnamed>',
        layout: device.createPipelineLayout({
          label: `${getName(this) ?? '<unnamed>'} - Pipeline Layout`,
          bindGroupLayouts: usedBindGroupLayouts.map((l) => this.root.unwrap(l)),
        }),
        compute: { module },
      }),
      usedBindGroupLayouts,
      catchall,
      logResources,
    };

    this.#performanceTracker.measureCompile(device);
  }

  public unwrap(): Memo {
    this.initSync();
    return this.#memo as Memo;
  }

  private resolveAndCreateShaderModule() {
    const device = this.root.device;
    const enableExtensions = wgslEnableExtensions.filter((extension) =>
      this.root.enabledFeatures.has(wgslEnableExtensionToFeatureName[extension]),
    );

    // Resolving code
    const ns = namespace({ names: this.root.nameRegistrySetting });
    const resolutionResult = this.#performanceTracker.measureResolve(() =>
      resolve(this, {
        namespace: ns,
        minify: this.root.minify,
        enableExtensions,
        shaderGenerator: this.root.shaderGeneratorClass
          ? new this.root.shaderGeneratorClass()
          : undefined,
        root: this.root,
      }),
    );
    const { code, usedBindGroupLayouts, catchall } = resolutionResult;

    if (catchall !== undefined) {
      usedBindGroupLayouts[catchall[0]]?.$name(
        `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
      );
    }

    warnIfOverflow(usedBindGroupLayouts, device.limits);

    const module = device.createShaderModule({
      label: `${getName(this) ?? '<unnamed>'} - Shader`,
      code,
    });

    return { resolutionResult, module };
  }
}

import type { AnyComputeBuiltin } from '../../builtin.ts';
import type { TgpuQuerySet } from '../querySet/querySet.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { Void } from '../../data/wgslTypes.ts';
import { resolve } from '../../resolutionCtx.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, PERF, setName } from '../../shared/meta.ts';

import { $getNameForward, $internal, $resolve } from '../../shared/symbols.ts';
import {
  isBindGroup,
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
import { emitComputeDispatch, queueLogDrain, warnAboutUnreachableSubmission } from './drawState.ts';
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
import { resolveIndirectOffset } from './pipelineUtils.ts';
import {
  createWithPerformanceCallback,
  createWithTimestampWrites,
  queueTimestampResolve,
  type Timeable,
  type TimestampWritesPriors,
} from './timeable.ts';
import type { IndirectFlag, TgpuBuffer } from '../buffer/buffer.ts';
import {
  NullPerformanceTracker,
  PerformanceTrackerImpl,
  type PerformanceTracker,
} from './performanceTracker.ts';
import { logger } from '../../tgpuLogger.ts';

export interface ComputePipelineInternals {
  readonly core: ComputePipelineCore;
  readonly rawPipeline: GPUComputePipeline;
  readonly priors: TgpuComputePipelinePriors & TimestampWritesPriors;
  readonly root: ExperimentalTgpuRoot;
}

// ----------
// Public API
// ----------

export interface TgpuComputePipeline extends TgpuNamable, SelfResolvable, Timeable {
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
  branch: ExperimentalTgpuRoot,
  slotBindings: [TgpuSlot<unknown>, unknown][],
  descriptor: TgpuComputePipeline.Descriptor,
) {
  return new TgpuComputePipelineImpl(new ComputePipelineCore(branch, slotBindings, descriptor), {});
}

// --------------
// Implementation
// --------------

type TgpuComputePipelinePriors = {
  readonly bindGroupLayoutMap?: Map<TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup>;
  /** A pass the pipeline dispatches into, but does not own. */
  readonly pass?: TgpuComputePass | undefined;
  /** An encoder the pipeline records its own passes into, but does not submit. */
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
  public readonly resourceType = 'compute-pipeline';
  readonly [$getNameForward]: ComputePipelineCore;

  readonly #core: ComputePipelineCore;
  readonly #priors: TgpuComputePipelinePriors;

  constructor(core: ComputePipelineCore, priors: TgpuComputePipelinePriors) {
    this.#core = core;
    this.#priors = priors;

    this[$internal] = {
      core,
      get rawPipeline() {
        return core.unwrap().pipeline;
      },
      get priors() {
        return priors;
      },
      get root() {
        return core.root;
      },
    };
    this[$getNameForward] = core;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    return ctx.resolve(this.#core);
  }

  toString(): string {
    return `computePipeline:${getName(this) ?? '<unnamed>'}`;
  }

  get rawPipeline(): GPUComputePipeline {
    return this.#core.unwrap().pipeline;
  }

  /** Rebinds the target this pipeline records into. The two are mutually exclusive. */
  #withTarget(target: { pass?: TgpuComputePass; encoder?: TgpuCommandEncoder }): this {
    return new TgpuComputePipelineImpl(this.#core, {
      ...this.#priors,
      pass: target.pass,
      encoder: target.encoder,
    }) as this;
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
    if (isTgpuComputePass(first)) {
      return this.#withTarget({ pass: first });
    }

    if (isTgpuCommandEncoder(first)) {
      return this.#withTarget({ encoder: first });
    }

    if (isGPUComputePassEncoder(first)) {
      return this.#withTarget({ pass: INTERNAL_adoptComputePass(this.#core.root, first) });
    }

    if (isGPUCommandEncoder(first)) {
      return this.#withTarget({ encoder: INTERNAL_adoptCommandEncoder(this.#core.root, first) });
    }

    if (isBindGroup(first)) {
      return new TgpuComputePipelineImpl(this.#core, {
        ...this.#priors,
        bindGroupLayoutMap: new Map([
          ...(this.#priors.bindGroupLayoutMap ?? []),
          [first.layout, first],
        ]),
      }) as this;
    }

    return new TgpuComputePipelineImpl(this.#core, {
      ...this.#priors,
      bindGroupLayoutMap: new Map([
        ...(this.#priors.bindGroupLayoutMap ?? []),
        [first, bindGroup as TgpuBindGroup | GPUBindGroup],
      ]),
    }) as this;
  }

  withPerformanceCallback(callback: (start: bigint, end: bigint) => void | Promise<void>): this {
    if (this.#priors.timestampWrites) {
      return new TgpuComputePipelineImpl(this.#core, {
        ...this.#priors,
        performanceCallback: callback,
      }) as this;
    }

    const querySet = this.#core.performanceCallbackQuerySet;
    if (!querySet) {
      logger.warn(
        'webgpu-feature-missing',
        'Performance callback cannot be used because the timestamp-query feature is not enabled on the root.',
      );
      return this;
    }
    const newPriors = createWithPerformanceCallback(this.#priors, callback, querySet);
    return new TgpuComputePipelineImpl(this.#core, newPriors) as this;
  }

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): this {
    const newPriors = createWithTimestampWrites(this.#priors, options, this.#core.root);
    return new TgpuComputePipelineImpl(this.#core, newPriors) as this;
  }

  dispatchWorkgroups(x: number, y?: number, z?: number): void {
    this.#execute((pass) => pass.dispatchWorkgroups(x, y, z));
  }

  dispatchWorkgroupsIndirect<T extends AnyWgslData>(
    indirectBuffer: (TgpuBuffer<T> & IndirectFlag) | GPUBuffer,
    start?: PrimitiveOffsetInfo | number,
  ): void {
    const DISPATCH_SIZE = 12; // 3 x u32 (x, y, z)

    const rawBuffer = isGPUBuffer(indirectBuffer) ? indirectBuffer : indirectBuffer.buffer;
    const offset = resolveIndirectOffset(
      indirectBuffer,
      start,
      DISPATCH_SIZE,
      'dispatchWorkgroupsIndirect',
    );

    this.#execute((pass) => pass.dispatchWorkgroupsIndirect(rawBuffer, offset));
  }

  initAsync(): Promise<void> {
    return this.#core.initAsync();
  }

  initSync() {
    this.#core.initSync();
  }

  /**
   * The single route from a dispatch call to the GPU. Either the pipeline was
   * given a pass to dispatch into, or it begins one of its own - and if it was
   * not given an encoder either, it owns the submission too.
   */
  #execute(dispatch: (pass: GPUComputePassEncoder) => void): void {
    const { root } = this.#core;
    const priors = this.#priors;

    if (priors.pass) {
      emitComputeDispatch(root, priors.pass[$internal], this, dispatch);
      return;
    }

    const encoder = priors.encoder ?? INTERNAL_createCommandEncoder(root);
    const pass = encoder.beginComputePass({
      label: getName(this.#core) ?? '<unnamed>',
      timestampWrites: priors.timestampWrites,
    });
    emitComputeDispatch(root, pass[$internal], this, dispatch, /* ownsPass */ true);
    pass.end();

    const { logResources } = this.#core.unwrap();
    if (logResources && !queueLogDrain(encoder, logResources)) {
      warnAboutUnreachableSubmission(this.#core, 'Shader console.log output');
    }

    if (priors.performanceCallback && !queueTimestampResolve(encoder, priors)) {
      warnAboutUnreachableSubmission(this.#core, 'The performance callback');
    }

    if (priors.encoder === undefined) {
      encoder.submit();
    }
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
  #descriptor: TgpuComputePipeline.Descriptor;
  #performanceCallbackQuerySet: TgpuQuerySet<'timestamp'> | undefined;

  constructor(
    root: ExperimentalTgpuRoot,
    slotBindings: [TgpuSlot<unknown>, unknown][],
    descriptor: TgpuComputePipeline.Descriptor,
  ) {
    this.root = root;
    this.#slotBindings = slotBindings;
    this.#descriptor = descriptor;
    this.#performanceTracker = PERF?.enabled
      ? new PerformanceTrackerImpl()
      : new NullPerformanceTracker();
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
        enableExtensions,
        shaderGenerator: this.root.shaderGenerator,
        root: this.root,
      }),
    );
    const { code, usedBindGroupLayouts, catchall } = resolutionResult;

    if (catchall !== undefined) {
      usedBindGroupLayouts[catchall[0]]?.$name(
        `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
      );
    }

    const module = device.createShaderModule({
      label: `${getName(this) ?? '<unnamed>'} - Shader`,
      code,
    });

    return { resolutionResult, module };
  }
}

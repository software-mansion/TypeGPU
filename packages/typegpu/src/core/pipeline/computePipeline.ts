import type { AnyComputeBuiltin } from '../../builtin.ts';
import type { TgpuQuerySet } from '../querySet/querySet.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { Void } from '../../data/wgslTypes.ts';
import { resolve } from '../../resolutionCtx.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, PERF, setName } from '../../shared/meta.ts';
import type { InferInput } from '../../shared/repr.ts';

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
import {
  createImmediateSnapshot,
  type ImmediateSnapshot,
  isImmediateVar,
  type TgpuImmediateVar,
  validateImmediateUsage,
} from '../immediate/immediateVar.ts';
import {
  collectOverrideConstants,
  isOverride,
  type OverrideValue,
  overrideConstantsKey,
  type TgpuOverride,
  validateOverrideValueFor,
} from '../override/tgpuOverride.ts';
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
  /** Returns the GPU pipeline specialized with this pipeline's override values */
  readonly materialize: () => GPUComputePipeline;
}

export interface TgpuComputePipelineSoul extends TgpuDeviceOwningSoul<
  'compute-pipeline',
  GPUComputePipeline
> {
  usedBindGroupLayouts?: TgpuBindGroupLayout[] | undefined;
  bindGroups?: [TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup][] | undefined;
  usedImmediate?: TgpuImmediateVar | undefined;
  immediates?: [TgpuImmediateVar, ImmediateSnapshot][] | undefined;
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
   * Provides a value for the given immediate variable, applied on dispatch
   * like the rest of the pipeline-held state and overridden by
   * `pass.setImmediates`. The value is captured (copied) at call time;
   * mutating it afterwards has no effect.
   *
   * Passing an `ArrayBuffer` or typed array skips serialization entirely; the bytes
   * are copied verbatim and the caller guarantees they match the schema's layout.
   */
  with<T extends AnyWgslData>(
    immediate: TgpuImmediateVar<T>,
    value: InferInput<T> | ArrayBuffer | ArrayBufferView,
  ): this;
  /**
   * Provides a value for the given pipeline-overridable constant. Overrides are baked
   * into the GPU pipeline, so every distinct combination of values compiles (and caches)
   * a separate pipeline, sharing the same shader module.
   */
  with<T extends AnyWgslData>(override: TgpuOverride<T>, value: InferInput<T>): this;
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
  const core = ComputePipelineCore.precompiled(root, soul.raw, {
    usedBindGroupLayouts: soul.usedBindGroupLayouts ?? [],
    // The catchall group is already one of `bindGroups`, keyed by the layout it was resolved with
    catchall: undefined,
    logResources: undefined,
    usedImmediate: soul.usedImmediate,
  });
  const pipeline: TgpuComputePipeline = new TgpuComputePipelineImpl(core, {
    bindGroupLayoutMap: new Map(soul.bindGroups),
    immediatesMap: new Map(soul.immediates),
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
  readonly immediatesMap?: Map<TgpuImmediateVar, ImmediateSnapshot> | undefined;
  readonly overridesMap?: Map<TgpuOverride, OverrideValue> | undefined;
} & TimestampWritesPriors;

type Memo = {
  /** Undefined for precompiled pipelines, which are never compiled again */
  module: GPUShaderModule | undefined;
  /** Undefined for precompiled pipelines, which are never compiled again */
  layout: GPUPipelineLayout | undefined;
  usedBindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | undefined;
  logResources: LogResources | undefined;
  usedImmediate: TgpuImmediateVar | undefined;
  usedOverrides: ReadonlyMap<TgpuOverride, string>;
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
          soul.raw = core.getPipeline(priors.overridesMap);
          soul.usedBindGroupLayouts = memo.usedBindGroupLayouts;
          soul.bindGroups = collectBindGroupPairs(
            memo.usedBindGroupLayouts,
            memo.catchall,
            priors.bindGroupLayoutMap,
          );
          soul.usedImmediate = memo.usedImmediate;
          soul.immediates = [...(priors.immediatesMap ?? [])];
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
  with<T extends AnyWgslData>(
    immediate: TgpuImmediateVar<T>,
    value: InferInput<T> | ArrayBuffer | ArrayBufferView,
  ): this;
  with<T extends AnyWgslData>(override: TgpuOverride<T>, value: InferInput<T>): this;
  with(pass: TgpuComputePass): this;
  with(encoder: TgpuCommandEncoder): this;
  with(encoder: GPUCommandEncoder): this;
  with(pass: GPUComputePassEncoder): this;
  with(
    first:
      | TgpuBindGroupLayout
      | TgpuBindGroup
      | TgpuImmediateVar
      | TgpuOverride
      | TgpuComputePass
      | TgpuCommandEncoder
      | GPUCommandEncoder
      | GPUComputePassEncoder,
    resource?: unknown,
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

    if (isImmediateVar(first)) {
      return this.#withPriors({
        immediatesMap: new Map(internals.priors.immediatesMap).set(
          first,
          createImmediateSnapshot(first, resource),
        ),
      });
    }

    if (isOverride(first)) {
      if (internals.core.isPrecompiled) {
        throw new Error('Cannot provide override values to a restored pipeline.');
      }
      return this.#withPriors({
        overridesMap: new Map(internals.priors.overridesMap).set(
          first,
          validateOverrideValueFor(first, resource),
        ),
      });
    }

    if (isBindGroup(first) || isBindGroupLayout(first)) {
      const [layout, group] = isBindGroup(first)
        ? [first.layout, first]
        : [first, resource as TgpuBindGroup | GPUBindGroup];

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
    const { core, priors } = this[$internal];
    return core.initAsync(priors.overridesMap);
  }

  initSync() {
    this[$internal].materialize();
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

  #memo: Memo | undefined;
  /** Compiled pipelines, keyed by the override constants they were specialized with */
  readonly #pipelines = new Map<string, GPUComputePipeline>();
  readonly #pendingPipelines = new Map<string, Promise<void>>();
  /** Set only for restored pipelines, which cannot be specialized any further */
  #precompiledPipeline: GPUComputePipeline | undefined;

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

  static precompiled(
    root: ExperimentalTgpuRoot,
    pipeline: GPUComputePipeline,
    memo: Omit<Memo, 'module' | 'layout' | 'usedOverrides'>,
  ): ComputePipelineCore {
    const core = new ComputePipelineCore(root, [], undefined);
    core.#memo = { ...memo, module: undefined, layout: undefined, usedOverrides: new Map() };
    core.#precompiledPipeline = pipeline;
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

  get isPrecompiled(): boolean {
    return this.#precompiledPipeline !== undefined;
  }

  /**
   * @privateRemarks
   * This function cannot be a regular async function
   * because when called multiple times before the promise finishes,
   * we want it to return the same promise each time.
   */
  initAsync(overrides: ReadonlyMap<TgpuOverride, OverrideValue> | undefined): Promise<void> {
    if (this.#precompiledPipeline) {
      return Promise.resolve();
    }

    const memo = this.unwrap();
    const constants = collectOverrideConstants(memo.usedOverrides, overrides);
    const key = overrideConstantsKey(constants);

    if (this.#pipelines.has(key)) {
      // the pipeline was already compiled
      return Promise.resolve();
    }

    let promise = this.#pendingPipelines.get(key);
    if (promise === undefined) {
      // the pipeline did not start compilation
      const device = this.root.device;
      promise = device
        .createComputePipelineAsync(this.#pipelineDescriptor(memo, constants))
        .then((pipeline) => {
          this.#pipelines.set(key, pipeline);
          this.#performanceTracker.measureCompile(device);
        })
        .finally(() => {
          this.#pendingPipelines.delete(key);
        });
      this.#pendingPipelines.set(key, promise);
    }
    return promise;
  }

  /**
   * Returns the GPU pipeline specialized with the given override values,
   * compiling it if it doesn't exist yet.
   */
  getPipeline(overrides: ReadonlyMap<TgpuOverride, OverrideValue> | undefined): GPUComputePipeline {
    if (this.#precompiledPipeline) {
      return this.#precompiledPipeline;
    }

    const memo = this.unwrap();
    const constants = collectOverrideConstants(memo.usedOverrides, overrides);
    const key = overrideConstantsKey(constants);

    const cached = this.#pipelines.get(key);
    if (cached) {
      return cached;
    }

    if (this.#pendingPipelines.has(key)) {
      throw new Error("'pipeline.initAsync()' was called and is not yet resolved.");
    }

    const device = this.root.device;
    const pipeline = device.createComputePipeline(this.#pipelineDescriptor(memo, constants));
    this.#pipelines.set(key, pipeline);
    this.#performanceTracker.measureCompile(device);
    return pipeline;
  }

  /**
   * Resolves the shader and creates the shader module & pipeline layout,
   * shared by every pipeline specialized from this core.
   */
  public unwrap(): Memo {
    this.#memo ??= this.#resolveAndCreateShaderModule();
    return this.#memo;
  }

  #pipelineDescriptor(memo: Memo, constants: Record<string, number>): GPUComputePipelineDescriptor {
    invariant(memo.module && memo.layout, 'Expected the shader module to be created.');
    return {
      label: getName(this) ?? '<unnamed>',
      layout: memo.layout,
      compute:
        Object.keys(constants).length > 0
          ? { module: memo.module, constants }
          : { module: memo.module },
    };
  }

  #resolveAndCreateShaderModule(): Memo {
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
    const { code, usedBindGroupLayouts, catchall, logResources, usedImmediate, usedOverrides } =
      resolutionResult;

    if (catchall !== undefined) {
      usedBindGroupLayouts[catchall[0]]?.$name(
        `${getName(this) ?? '<unnamed>'} - Automatic Bind Group & Layout`,
      );
    }

    warnIfOverflow(usedBindGroupLayouts, device.limits);

    const immediateSize = usedImmediate ? validateImmediateUsage(usedImmediate, this.root) : 0;

    const module = device.createShaderModule({
      label: `${getName(this) ?? '<unnamed>'} - Shader`,
      code,
    });

    const layout = device.createPipelineLayout({
      label: `${getName(this) ?? '<unnamed>'} - Pipeline Layout`,
      bindGroupLayouts: usedBindGroupLayouts.map((l) => this.root.unwrap(l)),
      immediateSize,
    });

    return {
      module,
      layout,
      usedBindGroupLayouts,
      catchall,
      logResources,
      usedImmediate,
      usedOverrides,
    };
  }
}

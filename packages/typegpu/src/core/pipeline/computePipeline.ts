import type { AnyComputeBuiltin } from '../../builtin.ts';
import type { TgpuQuerySet } from '../../core/querySet/querySet.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import { Void } from '../../data/wgslTypes.ts';
import { applyBindGroups } from './applyPipelineState.ts';
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
import { isGPUCommandEncoder, isGPUComputePassEncoder } from './typeGuards.ts';
import { logDataFromGPU } from '../../tgsl/consoleLog/deserializers.ts';
import type { LogResources } from '../../tgsl/consoleLog/types.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { wgslExtensions, wgslExtensionToFeatureName } from '../../wgslExtensions.ts';
import type { IORecord } from '../function/fnTypes.ts';
import type { TgpuComputeFn } from '../function/tgpuComputeFn.ts';
import { namespace } from '../resolve/namespace.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import type { TgpuSlot } from '../slot/slotTypes.ts';

import { memoryLayoutOf, type PrimitiveOffsetInfo } from '../../data/offsetUtils.ts';
import {
  createWithPerformanceCallback,
  createWithTimestampWrites,
  setupTimestampWrites,
  type Timeable,
  type TimestampWritesPriors,
  triggerPerformanceCallback,
} from './timeable.ts';
import type { IndirectFlag, TgpuBuffer } from '../buffer/buffer.ts';

interface ComputePipelineInternals {
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
  with(encoder: GPUCommandEncoder): this;
  with(pass: GPUComputePassEncoder): this;

  dispatchWorkgroups(x: number, y?: number, z?: number): void;

  /**
   * Dispatches compute workgroups using parameters read from a buffer.
   * The buffer must contain 3 consecutive u32 values (x, y, z workgroup counts).
   * To get the correct offset within complex data structures, use `d.memoryLayoutOf(...)`.
   *
   * @param indirectBuffer - Buffer marked with 'indirect' usage containing dispatch parameters
   * @param start - PrimitiveOffsetInfo pointing to the first dispatch parameter. If not provided, starts at offset 0. To obtain safe offsets, use `d.memoryLayoutOf(...)`.
   */
  dispatchWorkgroupsIndirect<T extends AnyWgslData>(
    indirectBuffer: TgpuBuffer<T> & IndirectFlag,
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
  readonly externalEncoder?: GPUCommandEncoder | undefined;
  readonly externalPass?: GPUComputePassEncoder | undefined;
} & TimestampWritesPriors;

type Memo = {
  pipeline: GPUComputePipeline;
  usedBindGroupLayouts: TgpuBindGroupLayout[];
  catchall: [number, TgpuBindGroup] | undefined;
  logResources: LogResources | undefined;
};

function validateIndirectBufferSize(
  bufferSize: number,
  offset: number,
  requiredBytes: number,
  operation: string,
): void {
  if (offset + requiredBytes > bufferSize) {
    throw new Error(
      `Buffer too small for ${operation}. ` +
        `Required: ${requiredBytes} bytes at offset ${offset}, ` +
        `but buffer is only ${bufferSize} bytes.`,
    );
  }

  if (offset % 4 !== 0) {
    throw new Error(`Indirect buffer offset must be a multiple of 4. Got: ${offset}`);
  }
}

const _lastAppliedCompute = new WeakMap<GPUComputePassEncoder, TgpuComputePipelineImpl>();

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

  with<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries>,
  ): this;
  with(bindGroupLayout: TgpuBindGroupLayout, bindGroup: GPUBindGroup): this;
  with(bindGroup: TgpuBindGroup): this;
  with(encoder: GPUCommandEncoder): this;
  with(pass: GPUComputePassEncoder): this;
  with(
    first: TgpuBindGroupLayout | TgpuBindGroup | GPUCommandEncoder | GPUComputePassEncoder,
    bindGroup?: TgpuBindGroup | GPUBindGroup,
  ): this {
    if (isGPUComputePassEncoder(first)) {
      return new TgpuComputePipelineImpl(this.#core, {
        ...this.#priors,
        externalPass: first,
        externalEncoder: undefined,
      }) as this;
    }

    if (isGPUCommandEncoder(first)) {
      return new TgpuComputePipelineImpl(this.#core, {
        ...this.#priors,
        externalEncoder: first,
        externalPass: undefined,
      }) as this;
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
    const newPriors = createWithPerformanceCallback(this.#priors, callback, this.#core.root);
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
    this._executeComputePass((pass) => pass.dispatchWorkgroups(x, y, z));
  }

  dispatchWorkgroupsIndirect<T extends AnyWgslData>(
    indirectBuffer: TgpuBuffer<T> & IndirectFlag,
    start?: PrimitiveOffsetInfo | number,
  ): void {
    const DISPATCH_SIZE = 12; // 3 x u32 (x, y, z)

    let offsetInfo = start ?? memoryLayoutOf(indirectBuffer.dataType);

    if (typeof offsetInfo === 'number') {
      if (offsetInfo === 0) {
        offsetInfo = memoryLayoutOf(indirectBuffer.dataType);
      } else {
        console.warn(
          `dispatchWorkgroupsIndirect: Provided start offset ${offsetInfo} as a raw number. Use d.memoryLayoutOf(...) to include contiguous padding info for safer validation.`,
        );
        // When only an offset is provided, assume we have at least 12 bytes contiguous.
        offsetInfo = {
          offset: offsetInfo,
          contiguous: DISPATCH_SIZE,
        };
      }
    }

    const { offset, contiguous } = offsetInfo;

    validateIndirectBufferSize(
      sizeOf(indirectBuffer.dataType),
      offset,
      DISPATCH_SIZE,
      'dispatchWorkgroupsIndirect',
    );

    if (contiguous < DISPATCH_SIZE) {
      console.warn(
        `dispatchWorkgroupsIndirect: Starting at offset ${offset}, only ${contiguous} contiguous bytes are available before padding. Dispatch requires ${DISPATCH_SIZE} bytes (3 x u32). Reading across padding may result in undefined behavior.`,
      );
    }

    this._executeComputePass((pass) =>
      pass.dispatchWorkgroupsIndirect(indirectBuffer.buffer, offset),
    );
  }

  private _applyComputeState(pass: GPUComputePassEncoder): void {
    const memo = this.#core.unwrap();
    const { root } = this.#core;
    pass.setPipeline(memo.pipeline);

    applyBindGroups(pass, root, memo.usedBindGroupLayouts, memo.catchall, (layout) =>
      this.#priors.bindGroupLayoutMap?.get(layout),
    );
  }

  private _executeComputePass(dispatch: (pass: GPUComputePassEncoder) => void): void {
    const { root } = this.#core;

    if (this.#priors.externalPass) {
      if (_lastAppliedCompute.get(this.#priors.externalPass) !== this) {
        this._applyComputeState(this.#priors.externalPass);
        _lastAppliedCompute.set(this.#priors.externalPass, this);
      }
      dispatch(this.#priors.externalPass);
      return;
    }

    if (this.#priors.externalEncoder) {
      const passDescriptor: GPUComputePassDescriptor = {
        label: getName(this.#core) ?? '<unnamed>',
        ...setupTimestampWrites(this.#priors, root),
      };
      const pass = this.#priors.externalEncoder.beginComputePass(passDescriptor);
      this._applyComputeState(pass);
      dispatch(pass);
      pass.end();
      return;
    }

    const memo = this.#core.unwrap();

    const passDescriptor: GPUComputePassDescriptor = {
      label: getName(this.#core) ?? '<unnamed>',
      ...setupTimestampWrites(this.#priors, root),
    };

    const commandEncoder = root.device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass(passDescriptor);
    this._applyComputeState(pass);
    dispatch(pass);
    pass.end();
    root.device.queue.submit([commandEncoder.finish()]);

    if (memo.logResources) {
      logDataFromGPU(memo.logResources);
    }

    if (this.#priors.performanceCallback) {
      void triggerPerformanceCallback({
        root,
        priors: this.#priors,
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
  readonly root: ExperimentalTgpuRoot;
  private _memo: Memo | undefined;

  #slotBindings: [TgpuSlot<unknown>, unknown][];
  #descriptor: TgpuComputePipeline.Descriptor;

  constructor(
    root: ExperimentalTgpuRoot,
    slotBindings: [TgpuSlot<unknown>, unknown][],
    descriptor: TgpuComputePipeline.Descriptor,
  ) {
    this.root = root;
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
        this.root.enabledFeatures.has(wgslExtensionToFeatureName[extension]),
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

      const { code, usedBindGroupLayouts, catchall, logResources } = resolutionResult;

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
            bindGroupLayouts: usedBindGroupLayouts.map((l) => this.root.unwrap(l)),
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

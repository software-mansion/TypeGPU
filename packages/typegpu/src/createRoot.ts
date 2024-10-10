import type { Parsed } from 'typed-binary';
import {
  type TgpuBuffer,
  createBufferImpl,
  isBuffer,
} from './core/buffer/buffer';
import { INTERNAL_createComputePipeline } from './core/pipeline/computePipeline';
import type { JitTranspiler } from './jitTranspiler';
import { WeakMemo } from './memo';
import { type PlumListener, PlumStore } from './plumStore';
import type { Program } from './programBuilder';
import type { TgpuSettable } from './settableTrait';
import type { TgpuBindGroup, TgpuBindGroupLayout } from './tgpuBindGroupLayout';
import { isBindGroup, isBindGroupLayout } from './tgpuBindGroupLayout';
import type { ExtractPlumValue, TgpuPlum, Unsubscribe } from './tgpuPlumTypes';
import type {
  ComputePipelineExecutorOptions,
  RenderPipelineExecutorOptions,
  SetPlumAction,
  TgpuRoot,
} from './tgpuRoot';
import type { TgpuSampler } from './tgpuSampler';
import type {
  TgpuAnyTexture,
  TgpuAnyTextureView,
  TgpuTextureExternal,
} from './tgpuTexture';
import type { AnyTgpuData } from './types';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a root can interact via GPU buffers.
 */
class TgpuRootImpl implements TgpuRoot {
  private _buffers: TgpuBuffer<AnyTgpuData>[] = [];
  private _samplers = new WeakMap<TgpuSampler, GPUSampler>();
  private _textures = new WeakMap<TgpuAnyTexture, GPUTexture>();
  private _textureViews = new WeakMap<TgpuAnyTextureView, GPUTextureView>();
  private _externalTexturesStatus = new WeakMap<
    TgpuTextureExternal,
    'dirty' | 'clean'
  >();

  private _unwrappedBindGroupLayouts = new WeakMemo(
    (key: TgpuBindGroupLayout) => key.unwrap(this),
  );
  private _unwrappedBindGroups = new WeakMemo((key: TgpuBindGroup) =>
    key.unwrap(this),
  );

  private _pipelineExecutors: PipelineExecutor[] = [];
  private _commandEncoder: GPUCommandEncoder | null = null;

  private readonly _plumStore = new PlumStore();

  constructor(
    public readonly device: GPUDevice,
    public readonly jitTranspiler: JitTranspiler | undefined,
  ) {}

  get commandEncoder() {
    if (!this._commandEncoder) {
      this._commandEncoder = this.device.createCommandEncoder();
    }

    return this._commandEncoder;
  }

  createBuffer<TData extends AnyTgpuData>(
    typeSchema: TData,
    initialOrBuffer?: Parsed<TData> | TgpuPlum<Parsed<TData>> | GPUBuffer,
  ): TgpuBuffer<TData> {
    const buffer = createBufferImpl(this, typeSchema, initialOrBuffer).$device(
      this.device,
    );

    this._buffers.push(buffer);

    return buffer;
  }

  destroy() {
    for (const buffer of this._buffers) {
      buffer.destroy();
    }
  }

  unwrap(resource: TgpuBuffer<AnyTgpuData>): GPUBuffer;
  unwrap(resource: TgpuBindGroupLayout): GPUBindGroupLayout;
  unwrap(resource: TgpuBindGroup): GPUBindGroup;
  unwrap(
    resource: TgpuBuffer<AnyTgpuData> | TgpuBindGroupLayout | TgpuBindGroup,
  ): GPUBuffer | GPUBindGroupLayout | GPUBindGroup {
    if (isBuffer(resource)) {
      return resource.buffer;
    }

    if (isBindGroupLayout(resource)) {
      return this._unwrappedBindGroupLayouts.getOrMake(resource);
    }

    if (isBindGroup(resource)) {
      return this._unwrappedBindGroups.getOrMake(resource);
    }

    throw new Error(`Unknown resource type: ${resource}`);
  }

  /** @deprecated */
  textureFor(view: TgpuAnyTexture | TgpuAnyTextureView): GPUTexture {
    let source: TgpuAnyTexture;
    if ('texture' in view) {
      source = view.texture;
    } else {
      source = view;
    }

    let texture = this._textures.get(source);

    if (!texture) {
      const descriptor = {
        ...source.descriptor,
        usage: source.flags,
      } as GPUTextureDescriptor;
      texture = this.device.createTexture(descriptor);

      if (!texture) {
        throw new Error(`Failed to create texture for ${view}`);
      }
      this._textures.set(source, texture);
    }

    return texture;
  }

  /** @deprecated */
  viewFor(view: TgpuAnyTextureView): GPUTextureView {
    let textureView = this._textureViews.get(view);
    if (!textureView) {
      textureView = this.textureFor(view.texture).createView(view.descriptor);
      this._textureViews.set(view, textureView);
    }
    return textureView;
  }

  /** @deprecated */
  externalTextureFor(texture: TgpuTextureExternal): GPUExternalTexture {
    this._externalTexturesStatus.set(texture, 'clean');
    if (texture.descriptor.source === undefined) {
      throw new Error('External texture source needs to be defined before use');
    }
    return this.device.importExternalTexture(
      texture.descriptor as GPUExternalTextureDescriptor,
    );
  }

  /** @deprecated */
  samplerFor(sampler: TgpuSampler): GPUSampler {
    let gpuSampler = this._samplers.get(sampler);

    if (!gpuSampler) {
      gpuSampler = this.device.createSampler(sampler.descriptor);

      if (!gpuSampler) {
        throw new Error(`Failed to create sampler for ${sampler}`);
      }
      this._samplers.set(sampler, gpuSampler);
    }

    return gpuSampler;
  }

  createPipeline(): void {
    return INTERNAL_createComputePipeline(this);
  }

  setSource(
    texture: TgpuTextureExternal,
    source: HTMLVideoElement | VideoFrame,
  ) {
    this._externalTexturesStatus.set(texture, 'dirty');
    texture.descriptor.source = source;
  }

  isDirty(texture: TgpuTextureExternal): boolean {
    return this._externalTexturesStatus.get(texture) === 'dirty';
  }

  markClean(texture: TgpuTextureExternal) {
    this._externalTexturesStatus.set(texture, 'clean');
  }

  readPlum<TPlum extends TgpuPlum>(plum: TPlum): ExtractPlumValue<TPlum> {
    return this._plumStore.get(plum);
  }

  setPlum<TPlum extends TgpuPlum & TgpuSettable>(
    plum: TPlum,
    value: SetPlumAction<ExtractPlumValue<TPlum>>,
  ) {
    type Value = ExtractPlumValue<TPlum>;

    if (typeof value === 'function') {
      const compute = value as (prev: Value) => Value;
      this._plumStore.set(plum, compute(this._plumStore.get(plum)));
    } else {
      this._plumStore.set(plum, value);
    }
  }

  onPlumChange<TValue>(
    plum: TgpuPlum<TValue>,
    listener: PlumListener<TValue>,
  ): Unsubscribe {
    return this._plumStore.subscribe(plum, listener);
  }

  flush() {
    if (!this._commandEncoder) {
      return;
    }

    this.device.queue.submit([this._commandEncoder.finish()]);
    this._commandEncoder = null;
  }
}

interface PipelineExecutor {
  execute(
    options: RenderPipelineExecutorOptions | ComputePipelineExecutorOptions,
  ): void;
}

class RenderPipelineExecutor implements PipelineExecutor {
  constructor(
    private root: TgpuRoot,
    private pipeline: GPURenderPipeline,
    private vertexProgram: Program,
    private fragmentProgram: Program,
    private externalLayoutCount: number,
    private label?: string,
  ) {}

  execute(options: RenderPipelineExecutorOptions) {
    const {
      vertexCount,
      instanceCount,
      firstVertex,
      firstInstance,
      externalBindGroups,
      ...descriptor
    } = options;

    if ((externalBindGroups?.length ?? 0) !== this.externalLayoutCount) {
      throw new Error(
        `External bind group count doesn't match the external bind group layout configuration. Expected ${this.externalLayoutCount}, got: ${externalBindGroups?.length ?? 0}`,
      );
    }

    const passEncoder = this.root.commandEncoder.beginRenderPass({
      ...descriptor,
      label: this.label ?? '',
    });
    passEncoder.setPipeline(this.pipeline);

    (externalBindGroups ?? []).forEach((group, index) =>
      passEncoder.setBindGroup(index, group),
    );

    passEncoder.setBindGroup(
      (externalBindGroups ?? []).length,
      this.vertexProgram.bindGroupResolver.getBindGroup(),
    );
    passEncoder.setBindGroup(
      (externalBindGroups ?? []).length + 1,
      this.fragmentProgram.bindGroupResolver.getBindGroup(),
    );

    for (const [
      usage,
      index,
    ] of this.vertexProgram.bindGroupResolver.getVertexBuffers()) {
      passEncoder.setVertexBuffer(index, usage.allocatable.buffer);
    }

    passEncoder.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    passEncoder.end();
  }
}

class ComputePipelineExecutor implements PipelineExecutor {
  constructor(
    private root: TgpuRoot,
    private pipeline: GPUComputePipeline,
    private programs: Program[],
    private externalLayoutCount: number,
    private label?: string,
  ) {}

  execute(options?: ComputePipelineExecutorOptions) {
    const { workgroups = [1, 1], externalBindGroups } = options ?? {};

    if ((externalBindGroups?.length ?? 0) !== this.externalLayoutCount) {
      throw new Error(
        `External bind group count doesn't match the external bind group layout configuration. Expected ${this.externalLayoutCount}, got: ${externalBindGroups?.length ?? 0}`,
      );
    }

    const passEncoder = this.root.commandEncoder.beginComputePass({
      label: this.label ?? '',
    });
    passEncoder.setPipeline(this.pipeline);

    (externalBindGroups ?? []).forEach((group, index) =>
      passEncoder.setBindGroup(index, group),
    );

    this.programs.forEach((program, i) =>
      passEncoder.setBindGroup(
        (externalBindGroups ?? []).length + i,
        program.bindGroupResolver.getBindGroup(),
      ),
    );
    passEncoder.dispatchWorkgroups(...workgroups);
    passEncoder.end();
  }
}

/**
 * Options passed into {@link createRoot}.
 */
export type CreateRootOptions = {
  adapter?: GPURequestAdapterOptions | undefined;
  device?: GPUDeviceDescriptor | undefined;
  jitTranspiler?: JitTranspiler | undefined;
};

/**
 * @param options
 * @returns
 *
 * @example
 * When given no options, the function will ask the browser for a suitable GPU device.
 * ```ts
 * createRoot();
 * ```
 *
 * @example
 * If there are specific options that should be used when requesting a device, you can pass those in.
 * ```ts
 * const adapterOptions: GPURequestAdapterOptions = ...;
 * const deviceDescriptor: GPUDeviceDescriptor = ...;
 * createRoot({ adapter: adapterOptions, device: deviceDescriptor });
 * ```
 *
 * @example
 * If a specific device should be used instead, it can be passed in as a parameter.
 * ```ts
 * const device: GPUDevice = ...;
 * createRoot(device);
 * ```
 */
export async function createRoot(
  options?: CreateRootOptions,
): Promise<TgpuRoot> {
  if (doesResembleDevice(options?.device)) {
    return new TgpuRootImpl(options.device, options.jitTranspiler);
  }

  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter(options?.adapter);

  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }

  return new TgpuRootImpl(
    await adapter.requestDevice(options?.device),
    options?.jitTranspiler,
  );
}

function doesResembleDevice(value: unknown): value is GPUDevice {
  return (
    !!value &&
    typeof value === 'object' &&
    'createBuffer' in value &&
    'queue' in value
  );
}

import { MissingBindingError } from './errors';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import type { AnyWgslData } from './std140/types';
import {
  type BindPair,
  type ResolutionCtx,
  type Wgsl,
  type WgslAllocatable,
  type WgslBindable,
  type WgslResolvable,
  isResolvable,
} from './types';
import type { WgslBufferUsage } from './wgslBufferUsage';
import type WigsillRuntime from './wigsillRuntime';

export type Program = {
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  code: string;
};

function addUnique<T>(list: T[], value: T) {
  if (list.includes(value)) {
    return;
  }

  list.push(value);
}

export type ResolutionCtxImplOptions = {
  readonly bindings?: BindPair<unknown>[];
  readonly names: NameRegistry;
};

export class ResolutionCtxImpl implements ResolutionCtx {
  private readonly _bindings: BindPair<unknown>[];
  private readonly _names: NameRegistry;

  public dependencies: WgslResolvable[] = [];
  public usedMemory = new Set<WgslAllocatable>();
  public usedBuffers = new Set<WgslBufferUsage<AnyWgslData, string>>();

  private _memoizedResults = new WeakMap<WgslResolvable, string>();

  constructor({ bindings = [], names }: ResolutionCtxImplOptions) {
    this._bindings = bindings;
    this._names = names;
  }

  addDependency(item: WgslResolvable) {
    this.resolve(item);
    addUnique(this.dependencies, item);
  }

  addAllocatable(allocatable: WgslAllocatable): void {
    this.usedMemory.add(allocatable);
  }

  addBufferUsage<TData extends AnyWgslData, TUsage extends string>(
    bufferUsage: WgslBufferUsage<TData, TUsage>,
  ) {
    this.usedBuffers.add(bufferUsage);
  }

  nameFor(item: WgslResolvable): string {
    return this._names.nameFor(item);
  }

  requireBinding<T>(bindable: WgslBindable<T>): T {
    const binding = this._bindings.find(([b]) => b === bindable) as
      | BindPair<T>
      | undefined;

    if (!binding) {
      throw new MissingBindingError(bindable);
    }

    return binding[1];
  }

  tryBinding<T>(bindable: WgslBindable<T>, defaultValue: T): T {
    const binding = this._bindings.find(([b]) => b === bindable) as
      | BindPair<T>
      | undefined;

    if (!binding) {
      return defaultValue;
    }

    return binding[1];
  }

  resolve(item: Wgsl) {
    if (!isResolvable(item)) {
      return String(item);
    }

    const memoizedResult = this._memoizedResults.get(item);
    if (memoizedResult !== undefined) {
      return memoizedResult;
    }

    const result = item.resolve(this);
    this._memoizedResults.set(item, result);
    return result;
  }
}

type BuildOptions = {
  shaderStage: number;
  bindingGroup: number;
  nameRegistry?: NameRegistry;
};

export default class ProgramBuilder {
  private bindings: BindPair<unknown>[] = [];

  constructor(
    private runtime: WigsillRuntime,
    private root: WgslResolvable,
  ) {}

  provide<T>(bindable: WgslBindable<T>, value: T) {
    this.bindings.push([bindable, value]);
    return this;
  }

  build(options: BuildOptions): Program {
    const ctx = new ResolutionCtxImpl({
      bindings: this.bindings,
      names: options.nameRegistry ?? new RandomNameRegistry(),
    });

    // Resolving code
    const codeString = ctx.resolve(this.root);
    const usedMemory = Array.from(ctx.usedMemory);
    const usedBuffers = Array.from(ctx.usedBuffers);

    console.log('usedMemory', usedBuffers);

    usedBuffers.forEach((memory, idx) => {
      ctx.addDependency(memory.definitionCode(options.bindingGroup, idx));
    });

    const bindGroupLayout = this.runtime.device.createBindGroupLayout({
      entries: usedBuffers.map((memory, idx) => ({
        binding: idx,
        visibility: options.shaderStage,
        buffer: {
          type: memory.usage as GPUBufferBindingType,
        },
      })),
    });

    const bindGroup = this.runtime.device.createBindGroup({
      layout: bindGroupLayout,
      entries: usedBuffers.map((memory, idx) => ({
        binding: idx,
        resource: {
          buffer: this.runtime.bufferFor(memory.buffer),
        },
      })),
    });

    const dependencies = ctx.dependencies.slice();

    return {
      bindGroupLayout,
      bindGroup,
      code: `${dependencies.map((d) => ctx.resolve(d)).join('\n')}\n${codeString}`,
    };
  }
}

import { MissingBindingError } from './errors';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import {
  type ResolutionCtx,
  type WGSLBindPair,
  type WGSLBindableTrait,
  type WGSLItem,
  type WGSLMemoryTrait,
  type WGSLSegment,
  isWGSLItem,
} from './types';
import type WGSLRuntime from './wgslRuntime';

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
  readonly bindings?: WGSLBindPair<unknown>[];
  readonly names: NameRegistry;
};

export class ResolutionCtxImpl implements ResolutionCtx {
  private readonly _bindings: WGSLBindPair<unknown>[];
  private readonly _names: NameRegistry;

  public dependencies: WGSLItem[] = [];
  public usedMemory = new Set<WGSLMemoryTrait>();

  private _memoizedResults = new WeakMap<WGSLItem, string>();

  constructor({ bindings = [], names }: ResolutionCtxImplOptions) {
    this._bindings = bindings;
    this._names = names;
  }

  addDependency(item: WGSLItem) {
    this.resolve(item);
    addUnique(this.dependencies, item);
  }

  registerMemory(memoryEntry: WGSLMemoryTrait) {
    this.usedMemory.add(memoryEntry);
  }

  nameFor(item: WGSLItem): string {
    return this._names.nameFor(item);
  }

  requireBinding<T>(bindable: WGSLBindableTrait<T>): T {
    const binding = this._bindings.find(([b]) => b === bindable) as
      | WGSLBindPair<T>
      | undefined;

    if (!binding) {
      throw new MissingBindingError(bindable);
    }

    return binding[1];
  }

  tryBinding<T>(bindable: WGSLBindableTrait<T>, defaultValue: T): T {
    const binding = this._bindings.find(([b]) => b === bindable) as
      | WGSLBindPair<T>
      | undefined;

    if (!binding) {
      return defaultValue;
    }

    return binding[1];
  }

  resolve(item: WGSLSegment) {
    if (!isWGSLItem(item)) {
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
  private bindings: WGSLBindPair<unknown>[] = [];

  constructor(
    private runtime: WGSLRuntime,
    private root: WGSLItem,
  ) {}

  provide<T>(bindable: WGSLBindableTrait<T>, value: T) {
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

    usedMemory.forEach((memory, idx) => {
      ctx.addDependency(memory.definitionCode(options.bindingGroup, idx));
    });

    const bindGroupLayout = this.runtime.device.createBindGroupLayout({
      entries: usedMemory.map((memory, idx) => ({
        binding: idx,
        visibility: options.shaderStage,
        buffer: {
          type: memory.usage,
        },
      })),
    });

    const bindGroup = this.runtime.device.createBindGroup({
      layout: bindGroupLayout,
      entries: usedMemory.map((memory, idx) => ({
        binding: idx,
        resource: {
          buffer: this.runtime.bufferFor(memory),
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

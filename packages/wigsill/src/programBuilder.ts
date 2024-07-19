import { MissingBindingError } from './errors';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import {
  type BindPair,
  type BufferUsage,
  type ResolutionCtx,
  type Wgsl,
  type WgslBindable,
  type WgslBufferBindable,
  type WgslResolvable,
  isResolvable,
} from './types';
import { code } from './wgslCode';
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
  public usedBindables = new Set<WgslBufferBindable>();

  private _memoizedResults = new WeakMap<WgslResolvable, string>();

  constructor({ bindings = [], names }: ResolutionCtxImplOptions) {
    this._bindings = bindings;
    this._names = names;
  }

  addDependency(item: WgslResolvable) {
    this.resolve(item);
    addUnique(this.dependencies, item);
  }

  addBinding(bindable: WgslBufferBindable): void {
    this.usedBindables.add(bindable);
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

function usageToBindingType(usage: BufferUsage): GPUBufferBindingType {
  if (usage === 'uniform') {
    return 'uniform';
  }

  if (usage === 'mutableStorage') {
    return 'storage';
  }

  return 'read-only-storage';
}

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
    const usedBindables = Array.from(ctx.usedBindables);

    usedBindables.forEach((bindable, idx) => {
      let bindingType = 'storage, read';

      if (bindable.usage === 'uniform') {
        bindingType = 'uniform';
      }

      if (bindable.usage === 'mutableStorage') {
        bindingType = 'storage, read_write';
      }

      ctx.addDependency(
        code`@group(${options.bindingGroup}) @binding(${idx}) var<${bindingType}> ${bindable}: ${bindable.allocatable.dataType};`,
      );
    });

    const bindGroupLayout = this.runtime.device.createBindGroupLayout({
      entries: usedBindables.map((bindable, idx) => ({
        binding: idx,
        visibility: options.shaderStage,
        buffer: {
          type: usageToBindingType(bindable.usage),
        },
      })),
    });

    const bindGroup = this.runtime.device.createBindGroup({
      layout: bindGroupLayout,
      entries: usedBindables.map((bindable, idx) => ({
        binding: idx,
        resource: {
          buffer: this.runtime.bufferFor(bindable.allocatable),
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

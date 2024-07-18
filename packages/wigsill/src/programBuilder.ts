import {
  MemoryArenaConflictError,
  MissingBindingError,
  NotAllocatedMemoryError,
} from './errors';
import type { MemoryArena } from './memoryArena';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import {
  type BindPair,
  type ResolutionCtx,
  type Wgsl,
  type WgslAllocatable,
  type WgslBindable,
  type WgslResolvable,
  isResolvable,
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
  readonly memoryArenas?: MemoryArena[];
  readonly bindings?: BindPair<unknown>[];
  readonly names: NameRegistry;
};

export class ResolutionCtxImpl implements ResolutionCtx {
  private _entryToArenaMap = new WeakMap<WgslAllocatable, MemoryArena>();
  private readonly _bindings: BindPair<unknown>[];
  private readonly _names: NameRegistry;

  public dependencies: WgslResolvable[] = [];
  public usedMemoryArenas = new WeakSet<MemoryArena>();
  public memoryArenaDeclarationIdxMap = new WeakMap<MemoryArena, number>();

  private _memoizedResults = new WeakMap<WgslResolvable, string>();

  public get bindings() {
    return this._bindings;
  }

  /**
   * @throws {MemoryArenaConflict}
   */
  constructor({
    memoryArenas = [],
    bindings = [],
    names,
  }: ResolutionCtxImplOptions) {
    this._bindings = bindings;
    this._names = names;

    for (const arena of memoryArenas) {
      for (const entry of arena.memoryEntries) {
        if (this._entryToArenaMap.has(entry)) {
          throw new MemoryArenaConflictError(entry);
        }

        this._entryToArenaMap.set(entry, arena);
      }
    }
  }

  addDependency(item: WgslResolvable) {
    this.resolve(item);
    addUnique(this.dependencies, item);
  }

  /**
   * @throws {NotAllocatedMemoryError}
   */
  addAllocatable(allocatable: WgslAllocatable): void {
    const arena = this._entryToArenaMap.get(allocatable);
    if (!arena) {
      throw new NotAllocatedMemoryError(allocatable);
    }

    this.memoryArenaDeclarationIdxMap.set(arena, this.dependencies.length);
  }

  nameFor(item: WgslResolvable): string {
    return this._names.nameFor(item);
  }

  arenaFor(memoryEntry: WgslAllocatable): MemoryArena | null {
    return this._entryToArenaMap.get(memoryEntry) ?? null;
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
  arenas?: MemoryArena[];
  nameRegistry?: NameRegistry;
};

export default class ProgramBuilder {
  private bindings: BindPair<unknown>[] = [];

  constructor(
    private runtime: WGSLRuntime,
    private root: WgslResolvable,
  ) {}

  provide<T>(bindable: WgslBindable<T>, value: T) {
    this.bindings.push([bindable, value]);
    return this;
  }

  build(options: BuildOptions): Program {
    const arenas = options.arenas ?? [];

    const ctx = new ResolutionCtxImpl({
      memoryArenas: arenas,
      bindings: this.bindings,
      names: options.nameRegistry ?? new RandomNameRegistry(),
    });

    // Resolving memory arenas
    arenas.forEach((arena, idx) => {
      const definitionCode = arena.definitionCode(options.bindingGroup, idx);

      if (!definitionCode) {
        return;
      }

      this.runtime.registerArena(arena);
      ctx.addDependency(definitionCode);

      // dependencies.splice(
      //   ctx.memoryArenaDeclarationIdxMap.get(arena) ?? 0,
      //   0,
      //   definitionCode,
      // );
    });

    // Resolving code
    const codeString = ctx.resolve(this.root);

    const bindGroupLayout = this.runtime.device.createBindGroupLayout({
      entries: arenas.map((arena, idx) => ({
        binding: idx,
        visibility: options.shaderStage,
        buffer: {
          type: arena.bufferBindingType,
        },
      })),
    });

    const bindGroup = this.runtime.device.createBindGroup({
      layout: bindGroupLayout,
      entries: arenas.map((arena, idx) => ({
        binding: idx,
        resource: {
          buffer: this.runtime.bufferFor(arena),
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

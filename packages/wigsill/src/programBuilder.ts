import {
  MemoryArenaConflictError,
  MissingBindingError,
  NotAllocatedMemoryError,
} from './errors';
import { MemoryArena } from './memoryArena';
import { NameRegistry, RandomNameRegistry } from './nameRegistry';
import {
  ResolutionCtx,
  WGSLBindPair,
  WGSLBindableTrait,
  WGSLItem,
  WGSLMemoryTrait,
  WGSLSegment,
  isWGSLItem,
  isWGSLMemory,
} from './types';
import WGSLRuntime from './wgslRuntime';

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
  readonly bindings?: WGSLBindPair<unknown>[];
  readonly names: NameRegistry;
};

export class ResolutionCtxImpl implements ResolutionCtx {
  private _entryToArenaMap = new WeakMap<WGSLMemoryTrait, MemoryArena>();
  private readonly _bindings: WGSLBindPair<unknown>[];
  private readonly _names: NameRegistry;

  public dependencies: WGSLItem[] = [];
  public usedMemoryArenas = new WeakSet<MemoryArena>();
  public memoryArenaDeclarationIdxMap = new WeakMap<MemoryArena, number>();

  private _memoizedResults = new WeakMap<WGSLItem, string>();

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

  addMemoryArena(arena: MemoryArena) {
    for (const entry of arena.memoryEntries) {
      this._entryToArenaMap.set(entry, arena);
    }
  }

  addDependency(item: WGSLItem) {
    this.resolve(item);
    addUnique(this.dependencies, item);
  }

  /**
   * @throws {NotAllocatedMemoryError}
   */
  addMemory(memoryEntry: WGSLMemoryTrait): void {
    const arena = this._entryToArenaMap.get(memoryEntry);
    if (!arena) {
      throw new NotAllocatedMemoryError(memoryEntry);
    }

    this.memoryArenaDeclarationIdxMap.set(arena, this.dependencies.length);
  }

  nameFor(item: WGSLItem): string {
    return this._names.nameFor(item);
  }

  arenaFor(memoryEntry: WGSLMemoryTrait): MemoryArena | null {
    return this._entryToArenaMap.get(memoryEntry) ?? null;
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
  arenas?: MemoryArena[];
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

    console.log('-------------------');

    const memoryEntries = this.root
      .getChildItems(ctx)
      .filter((value) => isWGSLMemory(value))
      .map((value) => value as WGSLMemoryTrait);

    console.log('all memory entries', memoryEntries);

    const unassignedMemoryEntries = memoryEntries.filter(
      (entry) => !ctx.arenaFor(entry),
    );

    console.log('unassigned memory entries', unassignedMemoryEntries);

    if (unassignedMemoryEntries.length > 0) {
      const existingArenas = new Set();
      unassignedMemoryEntries.forEach((entry) => {
        const arena = this.runtime.arenaFor(entry);
        if (arena) {
          existingArenas.add(arena);
        }
      });
      let fallbackArena: MemoryArena;
      if (existingArenas.size === 1) {
        fallbackArena = existingArenas.values().next().value;
        console.log(
          'reusing existing fallback arena at',
          Math.max(0, arenas.length - 1),
          fallbackArena,
        );
      } else {
        fallbackArena = new MemoryArena({
          memoryEntries: unassignedMemoryEntries,
          bufferBindingType: 'uniform',
          usage:
            GPUBufferUsage.UNIFORM |
            GPUBufferUsage.COPY_DST |
            GPUBufferUsage.COPY_SRC |
            GPUBufferUsage.VERTEX,
        });
        this.runtime.registerArena(fallbackArena);
        console.log(
          'creating fallback arena at',
          Math.max(0, arenas.length - 1),
          fallbackArena,
        );
      }
      arenas.push(fallbackArena);
      ctx.addMemoryArena(fallbackArena);
      const definitionCode = fallbackArena.definitionCode(
        options.bindingGroup,
        Math.max(0, arenas.length - 1),
      );
      if (definitionCode) ctx.addDependency(definitionCode);
    }

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
          buffer: this.runtime.bufferFor(arena)!,
        },
      })),
    });

    const dependencies = ctx.dependencies.slice();

    return {
      bindGroupLayout,
      bindGroup,
      code:
        dependencies.map((d) => ctx.resolve(d)).join('\n') + '\n' + codeString,
    };
  }
}

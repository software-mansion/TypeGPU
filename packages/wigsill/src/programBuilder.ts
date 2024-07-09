import {
  MemoryArenaConflictError,
  MissingBindingError,
  NotAllocatedMemoryError,
} from './errors';
import { MemoryArena } from './memoryArena';
import {
  ResolutionCtx,
  WGSLBindPair,
  WGSLBindableTrait,
  WGSLItem,
  WGSLMemoryTrait,
  WGSLSegment,
  isWGSLItem,
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

class NameRegistry {
  private lastUniqueId = 0;
  private names = new WeakMap<WGSLItem, string>();

  nameFor(item: WGSLItem) {
    let name = this.names.get(item);

    if (name === undefined) {
      // creating sanitized name
      let label;
      if (item.debugLabel) {
        label = item.debugLabel.replaceAll(/\s/g, '_'); // whitespace -> _
        label = label.replaceAll(/[^\w\d]/g, ''); // removing illegal characters
      } else {
        label = 'item';
      }
      name = `${label}_${this.lastUniqueId++}`;
      this.names.set(item, name);
    }

    return name;
  }
}

class ResolutionCtxImpl implements ResolutionCtx {
  private _entryToArenaMap = new WeakMap<WGSLMemoryTrait, MemoryArena>();
  private readonly _names = new NameRegistry();

  public dependencies: WGSLItem[] = [];
  public usedMemoryArenas = new WeakSet<MemoryArena>();
  public memoryArenaDeclarationIdxMap = new WeakMap<MemoryArena, number>();

  private memoizedResults = new WeakMap<WGSLItem, string>();

  /**
   * @throws {MemoryArenaConflict}
   */
  constructor(
    private readonly runtime: WGSLRuntime,
    private readonly memoryArenas: MemoryArena[],
    private readonly _bindings: WGSLBindPair<unknown>[],
  ) {
    for (const arena of memoryArenas) {
      for (const entry of arena.memoryEntries) {
        if (this._entryToArenaMap.has(entry)) {
          throw new MemoryArenaConflictError(entry);
        }

        this._entryToArenaMap.set(entry, arena);
      }
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

    const memoizedResult = this.memoizedResults.get(item);
    if (memoizedResult !== undefined) {
      return memoizedResult;
    }

    const result = item.resolve(this);
    this.memoizedResults.set(item, result);
    return result;
  }
}

type BuildOptions = {
  shaderStage: number;
  bindingGroup: number;
  arenas?: MemoryArena[];
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

    const ctx = new ResolutionCtxImpl(this.runtime, arenas, this.bindings);

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

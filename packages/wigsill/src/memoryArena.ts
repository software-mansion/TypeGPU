import { roundUp } from './mathUtils';
import type { WgslAllocatable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

export type MemoryArenaOptions = {
  readonly usage: number;
  readonly bufferBindingType: GPUBufferBindingType;
  readonly minSize?: number;
  readonly memoryEntries: WgslAllocatable[];
};

/**
 * TODO: Documentation
 * A place for grouping WGSL memory items.
 */
export class MemoryArena {
  private _memoryOffsetMap = new WeakMap<WgslAllocatable, number>();

  public readonly bufferBindingType: GPUBufferBindingType;
  public readonly usage: number;
  public readonly size: number = 0;
  public readonly memoryEntries: WgslAllocatable[];
  public readonly identifier = new WgslIdentifier();
  public debugLabel?: string | undefined;

  constructor(options: MemoryArenaOptions) {
    this.bufferBindingType = options.bufferBindingType;
    this.memoryEntries = options.memoryEntries;
    this.usage = options.usage;

    // Laying out the memory...
    let size = 0;
    for (const memoryEntry of this.memoryEntries) {
      // aligning
      size = roundUp(size, memoryEntry.dataType.byteAlignment);
      this._memoryOffsetMap.set(memoryEntry, size);
      size += memoryEntry.dataType.size;
    }

    // aligning up to 16 bytes, which is a binding buffer requirement.
    size = roundUp(size, 16);

    if (options.minSize) {
      // applying minimum size
      size = Math.max(size, options.minSize);
    }

    this.size = size;
  }

  $name(debugLabel: string) {
    this.debugLabel = debugLabel;
    this.identifier.$name(debugLabel);
  }

  offsetFor(memoryEntry: WgslAllocatable): number | null {
    return this._memoryOffsetMap.get(memoryEntry) ?? null;
  }

  definitionCode(bindingGroup: number, bindingIdx: number) {
    const storageTypeIdentifier = new WgslIdentifier();
    if (this.debugLabel) {
      storageTypeIdentifier.$name(`${this.debugLabel}_type`);
    }

    const fieldDefinitions = 'temp';

    if (fieldDefinitions.length === 0) {
      return undefined;
    }

    let bindingType = 'storage, read';

    if (this.bufferBindingType === 'uniform') {
      bindingType = 'uniform';
    }

    if (this.bufferBindingType === 'storage') {
      bindingType = 'storage, read_write';
    }

    return code`
    struct ${storageTypeIdentifier} {
      ${fieldDefinitions}
    }

    @group(${bindingGroup}) @binding(${bindingIdx}) var<${bindingType}> ${this.identifier}: ${storageTypeIdentifier};
    `;
  }
}

export function makeArena(options: MemoryArenaOptions) {
  return new MemoryArena(options);
}

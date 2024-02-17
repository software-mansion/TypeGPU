import { roundUp } from './mathUtils';
import type { WGSLMemoryTrait } from './types';
import { code } from './wgslCode';
import { WGSLIdentifier } from './wgslIdentifier';

/**
 * TODO: Documentation
 * A place for grouping WGSL memory items.
 */
export class MemoryArena {
  private _size: number = 0;
  private _memoryOffsetMap = new WeakMap<WGSLMemoryTrait, number>();

  public readonly identifier = new WGSLIdentifier();
  public debugLabel?: string | undefined;

  constructor(
    public readonly usage: number,
    public readonly bufferBindingType: GPUBufferBindingType,
    public readonly memoryEntries: WGSLMemoryTrait[],
  ) {
    // Laying out the memory...
    for (const memoryEntry of memoryEntries) {
      // aligning
      this._size = roundUp(this._size, memoryEntry.baseAlignment);
      this._memoryOffsetMap.set(memoryEntry, this._size);
      this._size += memoryEntry.size;
    }

    // aligning up to 16 bytes, which is a binding buffer requirement.
    this._size = roundUp(this._size, 16);
  }

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
    this.identifier.alias(debugLabel);
  }

  get size() {
    return this._size;
  }

  offsetFor(memoryEntry: WGSLMemoryTrait): number | null {
    return this._memoryOffsetMap.get(memoryEntry) ?? null;
  }

  definitionCode(bindingGroup: number, bindingIdx: number) {
    const storageTypeIdentifier = new WGSLIdentifier();
    if (this.debugLabel) {
      storageTypeIdentifier.alias(`${this.debugLabel}_type`);
    }

    const fieldDefinitions = this.memoryEntries.map(
      (e) => e.structFieldDefinition,
    );

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

export function makeArena(
  usage: number,
  bufferBindingType: GPUBufferBindingType,
  memoryEntries: WGSLMemoryTrait[],
) {
  return new MemoryArena(usage, bufferBindingType, memoryEntries);
}

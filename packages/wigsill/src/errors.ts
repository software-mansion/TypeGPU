import { WGSLBindableTrait, WGSLMemoryTrait } from './types';

export class MissingBindingError extends Error {
  constructor(public readonly bindable: WGSLBindableTrait<unknown>) {
    super(`Missing binding for ${bindable.debugLabel ?? '<unnamed>'}`);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingBindingError.prototype);
  }
}

export class MemoryArenaConflictError extends Error {
  constructor(memoryEntry: WGSLMemoryTrait) {
    super(
      `Multiple arenas contain the same entry: ${memoryEntry.debugLabel ?? '<unnamed>'}`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MemoryArenaConflictError.prototype);
  }
}

export class NotAllocatedMemoryError extends Error {
  constructor(memoryEntry: WGSLMemoryTrait) {
    super(
      `An unallocated memory entry was used: ${memoryEntry.debugLabel ?? '<unnamed>'}. Every memory entry has to be in exactly one arena used during program building.`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NotAllocatedMemoryError.prototype);
  }
}

export class RecursiveDataTypeError extends Error {
  constructor() {
    super('Recursive types are not supported in WGSL');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, RecursiveDataTypeError.prototype);
  }
}
